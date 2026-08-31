import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fulfillMomoPayment } from "@/lib/momo-fulfillment";

/**
 * GET /crm/api/internal/momo/status?ref=MHMOMOM-...
 *
 * The portal's counterpart to the public status route. Same behaviour, but
 * behind INTERNAL_API_SECRET, so it can safely return the failure reason and
 * the sale amount for a signed-in member's own order.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Online payment is not configured yet." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reference = new URL(req.url).searchParams.get("ref");
  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  try {
    const payment = await fulfillMomoPayment(reference);
    if (!payment) {
      const known = await getDb().momoPayment.findUnique({ where: { merchantReference: reference } });
      if (!known) return NextResponse.json({ error: "Unknown payment reference." }, { status: 404 });
      return NextResponse.json({ status: known.status });
    }

    return NextResponse.json({
      status: payment.status,
      packageName: payment.packageName,
      amount: payment.chargedAmount ?? payment.amount,
      reason: payment.failureReason,
    });
  } catch (error) {
    // A blip talking to MTN is not a failed payment — keep the member waiting
    // rather than telling them it did not go through.
    console.error("[INTERNAL_MOMO_STATUS_ERROR]", error);
    return NextResponse.json({ status: "PENDING" });
  }
}
