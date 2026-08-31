import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fulfillMomoPayment } from "@/lib/momo-fulfillment";
import { corsHeaders } from "@/lib/public-cors";

/**
 * GET /crm/api/public/momo/status?ref=MHMOMO-...
 *
 * Polled by the pricing page while the customer answers the PIN prompt on
 * their phone. Each call re-checks MTN and fulfils the payment the first time
 * it reads as successful, so the checkout resolves even if the customer closes
 * the tab a moment later (the reconcile sweep is the backstop for the rest).
 *
 * Deliberately returns no personal data — only the outcome, the package and
 * the amount — because the reference travels in a URL.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, "GET, OPTIONS") });
}

export async function GET(req: Request) {
  const cors = corsHeaders(req, "GET, OPTIONS");
  const reference = new URL(req.url).searchParams.get("ref");

  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400, headers: cors });
  }

  try {
    const payment = await fulfillMomoPayment(reference);
    if (!payment) {
      const known = await getDb().momoPayment.findUnique({ where: { merchantReference: reference } });
      if (!known) {
        return NextResponse.json({ error: "Unknown payment reference." }, { status: 404, headers: cors });
      }
      return NextResponse.json({ status: known.status }, { headers: cors });
    }

    return NextResponse.json(
      {
        status: payment.status,
        packageName: payment.packageName,
        amount: payment.chargedAmount ?? payment.amount,
        reason: payment.failureReason,
      },
      { headers: cors },
    );
  } catch (error) {
    // A blip talking to MTN is not a failed payment. Report it as still
    // pending so the page keeps polling instead of telling the customer their
    // money did not go through.
    console.error("[MOMO_STATUS_ERROR]", error);
    return NextResponse.json({ status: "PENDING" }, { headers: cors });
  }
}
