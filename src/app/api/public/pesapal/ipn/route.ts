import { NextRequest, NextResponse } from "next/server";
import { fulfillPesapalPayment } from "@/lib/pesapal-fulfillment";

/**
 * GET /crm/api/public/pesapal/ipn
 *
 * Instant Payment Notification — Pesapal calls this server-to-server when a
 * transaction's status changes. Idempotent; safe to receive more than once.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderTrackingId = searchParams.get("OrderTrackingId");
  const orderMerchantReference = searchParams.get("OrderMerchantReference");
  const orderNotificationType = searchParams.get("OrderNotificationType") || "IPNCHANGE";

  if (!orderTrackingId || !orderMerchantReference) {
    return NextResponse.json({ error: "Missing OrderTrackingId or OrderMerchantReference" }, { status: 400 });
  }

  try {
    await fulfillPesapalPayment(orderMerchantReference, orderTrackingId);

    return NextResponse.json({
      orderNotificationType,
      orderTrackingId,
      orderMerchantReference,
      status: 200,
    });
  } catch (error) {
    console.error("[PESAPAL_IPN_ERROR]", error);
    // Still respond 200 so Pesapal stops retrying; status 500 in the body signals the failure.
    return NextResponse.json({
      orderNotificationType,
      orderTrackingId,
      orderMerchantReference,
      status: 500,
    });
  }
}
