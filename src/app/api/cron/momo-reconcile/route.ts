import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fulfillMomoPayment } from "@/lib/momo-fulfillment";

export const dynamic = "force-dynamic";

/**
 * POST /crm/api/cron/momo-reconcile
 *
 * A MoMo prompt is only resolved while the customer's browser is polling. If
 * they pay and immediately close the tab — or lose signal between approving on
 * the handset and the page hearing about it — the MomoPayment sticks on
 * PENDING and the money never reaches the CRM.
 *
 * This sweeps those rows: anything still PENDING after a short settling window
 * is re-checked against MTN, and anything unresolved long after a prompt could
 * still be answered is marked ABANDONED so it stops being retried. ABANDONED
 * is deliberately not one of the statuses `fulfillMomoPayment` treats as
 * final, so a late resolution can still rescue it.
 *
 * Protected by the same bearer CRON_SECRET as the other cron routes.
 */

// MTN prompts expire fast, so a MoMo order settles or dies much sooner than a
// Pesapal one — the windows here are correspondingly shorter.
const DEFAULT_MIN_AGE_MINUTES = 5;
const DEFAULT_ABANDON_AFTER_HOURS = 2;

/** Each row costs a MoMo API round-trip, so cap the work per invocation. */
const BATCH_LIMIT = 50;

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 500 });
    }
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const minAgeMinutes = positiveNumber(process.env.MOMO_RECONCILE_MIN_AGE_MINUTES, DEFAULT_MIN_AGE_MINUTES);
    const abandonAfterHours = positiveNumber(process.env.MOMO_ABANDON_AFTER_HOURS, DEFAULT_ABANDON_AFTER_HOURS);

    const now = Date.now();
    // Give a live prompt time to be answered before we start polling it.
    const settledBefore = new Date(now - minAgeMinutes * 60_000);
    const abandonedBefore = new Date(now - abandonAfterHours * 3_600_000);

    const db = getDb();
    const stale = await db.momoPayment.findMany({
      where: { status: "PENDING", createdAt: { lt: settledBefore } },
      orderBy: { createdAt: "asc" },
      take: BATCH_LIMIT,
    });

    const result = {
      scanned: stale.length,
      checked: 0,
      completed: 0,
      failed: 0,
      stillPending: 0,
      abandoned: 0,
      errors: [] as string[],
    };

    const markAbandoned = async (merchantReference: string) => {
      await db.momoPayment.update({ where: { merchantReference }, data: { status: "ABANDONED" } });
      result.abandoned++;
    };

    for (const row of stale) {
      // No reference id means requestToPay never returned one, so MTN has no
      // transaction to query — the row can only ever be aged out.
      if (!row.momoReferenceId) {
        if (row.createdAt < abandonedBefore) await markAbandoned(row.merchantReference);
        else result.stillPending++;
        continue;
      }

      try {
        result.checked++;
        const updated = await fulfillMomoPayment(row.merchantReference);

        if (updated?.status === "COMPLETED") {
          result.completed++;
        } else if (updated?.status === "FAILED") {
          result.failed++;
        } else if (row.createdAt < abandonedBefore) {
          await markAbandoned(row.merchantReference);
        } else {
          result.stillPending++;
        }
      } catch (error) {
        // A single bad row (or an MTN blip) must not abort the whole sweep.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[momo-reconcile] Failed on", row.merchantReference, message);
        result.errors.push(`${row.merchantReference}: ${message}`);
      }
    }

    console.log("[momo-reconcile] Result:", JSON.stringify(result));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[momo-reconcile] Error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to reconcile MoMo payments" },
      { status: 500 }
    );
  }
}
