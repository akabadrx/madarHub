import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fulfillDpoPayment } from "@/lib/dpo-fulfillment";

export const dynamic = "force-dynamic";

/**
 * POST /crm/api/cron/dpo-reconcile
 *
 * DPO only learns the outcome on its own page; the CRM hears about it when the
 * customer's browser follows the redirect back. Someone who pays and closes the
 * tab before the redirect therefore leaves a DpoPayment on PENDING with their
 * money already taken.
 *
 * This sweeps those rows: anything still PENDING after a short settling window
 * is re-verified with DPO. A transaction left unpaid past DPO's time limit
 * comes back as 903 and is closed as FAILED by fulfilment itself; anything
 * still unresolved long after that is marked ABANDONED so it stops being
 * retried. ABANDONED is deliberately *not* one of the statuses
 * `fulfillDpoPayment` treats as final, so a late check can still rescue it.
 *
 * Protected by the same bearer CRON_SECRET as the notification routes.
 */

const DEFAULT_MIN_AGE_MINUTES = 15;
const DEFAULT_ABANDON_AFTER_HOURS = 24;

/** Each row costs a DPO API round-trip, so cap the work per invocation. */
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

    const minAgeMinutes = positiveNumber(process.env.DPO_RECONCILE_MIN_AGE_MINUTES, DEFAULT_MIN_AGE_MINUTES);
    const abandonAfterHours = positiveNumber(process.env.DPO_ABANDON_AFTER_HOURS, DEFAULT_ABANDON_AFTER_HOURS);

    const now = Date.now();
    // Give a live checkout time to settle before we start polling it.
    const settledBefore = new Date(now - minAgeMinutes * 60_000);
    const abandonedBefore = new Date(now - abandonAfterHours * 3_600_000);

    const db = getDb();
    const stale = await db.dpoPayment.findMany({
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
      await db.dpoPayment.update({ where: { merchantReference }, data: { status: "ABANDONED" } });
      result.abandoned++;
    };

    for (const row of stale) {
      // No token means createToken never returned one, so DPO has no
      // transaction to verify — the row can only ever be aged out.
      if (!row.transToken) {
        if (row.createdAt < abandonedBefore) await markAbandoned(row.merchantReference);
        else result.stillPending++;
        continue;
      }

      try {
        result.checked++;
        const updated = await fulfillDpoPayment(row.merchantReference);

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
        // A single bad row (or a DPO blip) must not abort the whole sweep.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[dpo-reconcile] Failed on", row.merchantReference, message);
        result.errors.push(`${row.merchantReference}: ${message}`);
      }
    }

    console.log("[dpo-reconcile] Result:", JSON.stringify(result));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[dpo-reconcile] Error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to reconcile DPO payments" },
      { status: 500 }
    );
  }
}
