import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fulfillPesapalPayment } from "@/lib/pesapal-fulfillment";

/**
 * GET /crm/api/public/pesapal/callback
 *
 * The customer's browser is redirected here by Pesapal after checkout.
 * Verifies the transaction status (in case the IPN hasn't arrived yet) and
 * sends the customer back to a plain result page on the public site.
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
      amount: String(payment.amount),
    });

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
