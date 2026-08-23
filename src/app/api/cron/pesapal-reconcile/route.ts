import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fulfillPesapalPayment } from "@/lib/pesapal-fulfillment";

export const dynamic = "force-dynamic";

/**
 * POST /crm/api/cron/pesapal-reconcile
 *
 * Pesapal only fires an IPN when a transaction's status *changes*, and the
 * browser callback only runs if the customer comes back to the site. Someone
 * who abandons Pesapal's "Payment Processing" page — or taps "Exit
 * application" — therefore leaves a PesapalPayment stuck on PENDING forever,
 * with nothing anywhere to show they tried to pay.
 *
 * This sweeps those rows: anything still PENDING after a short settling window
 * is re-checked against Pesapal, and anything still unresolved long after a
 * real payment could have landed is marked ABANDONED so it stops being
 * retried. ABANDONED is deliberately *not* one of the statuses
 * `fulfillPesapalPayment` treats as final, so a late IPN can still rescue it.
 *
 * Protected by the same bearer CRON_SECRET as the notification routes.
 */

const DEFAULT_MIN_AGE_MINUTES = 15;
const DEFAULT_ABANDON_AFTER_HOURS = 24;

/** Each row costs a Pesapal API round-trip, so cap the work per invocation. */
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

    const minAgeMinutes = positiveNumber(process.env.PESAPAL_RECONCILE_MIN_AGE_MINUTES, DEFAULT_MIN_AGE_MINUTES);
    const abandonAfterHours = positiveNumber(process.env.PESAPAL_ABANDON_AFTER_HOURS, DEFAULT_ABANDON_AFTER_HOURS);

    const now = Date.now();
    // Give a live checkout time to settle before we start polling it.
    const settledBefore = new Date(now - minAgeMinutes * 60_000);
    const abandonedBefore = new Date(now - abandonAfterHours * 3_600_000);

    const db = getDb();
    const stale = await db.pesapalPayment.findMany({
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
      await db.pesapalPayment.update({ where: { merchantReference }, data: { status: "ABANDONED" } });
      result.abandoned++;
    };

    for (const row of stale) {
      // No tracking id means SubmitOrderRequest never returned one, so Pesapal
      // has no order to query — the row can only ever be aged out.
      if (!row.pesapalTrackingId) {
        if (row.createdAt < abandonedBefore) await markAbandoned(row.merchantReference);
        else result.stillPending++;
        continue;
      }

      try {
        result.checked++;
        const updated = await fulfillPesapalPayment(row.merchantReference, row.pesapalTrackingId);

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
        // A single bad row (or a Pesapal blip) must not abort the whole sweep.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[pesapal-reconcile] Failed on", row.merchantReference, message);
        result.errors.push(`${row.merchantReference}: ${message}`);
      }
    }

    console.log("[pesapal-reconcile] Result:", JSON.stringify(result));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[pesapal-reconcile] Error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to reconcile Pesapal payments" },
      { status: 500 }
    );
  }
}
