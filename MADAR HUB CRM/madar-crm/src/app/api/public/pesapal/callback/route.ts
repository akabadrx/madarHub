import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fulfillPesapalPayment } from "@/lib/pesapal-fulfillment";

/**
 * GET /crm/api/public/pesapal/callback
 *
 * The customer's browser is redirected here by Pesapal after checkout.
 * Verifies the transaction status (in case the IPN hasn't arrived yet) and
 * sends the customer back to a result page: the public site for a website
 * checkout, or the member portal for someone who paid while signed in there.
 */
export async function GET(req: NextRequest) {
  const siteUrl = process.env.MADAR_SITE_URL || "";
  const { searchParams } = new URL(req.url);
  const orderTrackingId = searchParams.get("OrderTrackingId");
  const orderMerchantReference = searchParams.get("OrderMerchantReference");

  if (!orderMerchantReference) {
    return NextResponse.redirect(`${siteUrl}/payment-failed.html`);
  }

  try {
    let payment = await getDb().pesapalPayment.findUnique({ where: { merchantReference: orderMerchantReference } });
    if (!payment) {
      return NextResponse.redirect(`${siteUrl}/payment-failed.html`);
    }

    if (payment.status === "PENDING" && orderTrackingId) {
      payment = (await fulfillPesapalPayment(orderMerchantReference, orderTrackingId)) || payment;
    }

    const params = new URLSearchParams({
      ref: payment.merchantReference,
      package: payment.packageName,
      amount: String(payment.chargedAmount ?? payment.amount),
    });

    // Sending a signed-in member to the public result page would drop them out
    // of the portal and make them navigate back in. Return them to their
    // account instead, with the outcome in the query string.
    if (payment.source === "membership") {
      const portalUrl = process.env.MEMBER_PORTAL_URL || `${siteUrl}/membership`;
      const outcome =
        payment.status === "COMPLETED" ? "success" : payment.status === "FAILED" ? "failed" : "pending";
      params.set("payment", outcome);
      return NextResponse.redirect(`${portalUrl}?${params.toString()}`);
    }

    if (payment.status === "COMPLETED") {
      return NextResponse.redirect(`${siteUrl}/payment-success.html?${params.toString()}`);
    }
    if (payment.status === "FAILED") {
      return NextResponse.redirect(`${siteUrl}/payment-failed.html?${params.toString()}`);
    }
    return NextResponse.redirect(`${siteUrl}/payment-pending.html?${params.toString()}`);
  } catch (error) {
    console.error("[PESAPAL_CALLBACK_ERROR]", error);
    return NextResponse.redirect(`${siteUrl}/payment-pending.html`);
  }
}
