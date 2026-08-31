import { getDb } from "@/lib/db";
import { getTransactionStatus } from "@/lib/pesapal";
import { recordOnlinePayment } from "@/lib/online-fulfillment";

/**
 * Checks a Pesapal order's real status and, the first time it is seen as
 * completed, creates/updates the Lead and records a Payment. Safe to call
 * repeatedly for the same order (from both the callback and the IPN) —
 * once a PesapalPayment is COMPLETED or FAILED, later calls are no-ops.
 */
export async function fulfillPesapalPayment(merchantReference: string, orderTrackingId: string) {
  const db = getDb();

  const existing = await db.pesapalPayment.findUnique({ where: { merchantReference } });
  if (!existing) return null;
  if (existing.status === "COMPLETED" || existing.status === "FAILED") return existing;

  const txStatus = await getTransactionStatus(orderTrackingId);

  if (txStatus.status_code === 1) {
    return db.$transaction(async (tx) => {
      const payment = await tx.pesapalPayment.findUnique({ where: { merchantReference } });
      if (!payment || payment.status === "COMPLETED" || payment.status === "FAILED") return payment;

      const leadId = await recordOnlinePayment(tx, {
        leadId: payment.leadId,
        customerName: payment.customerName,
        customerPhone: payment.customerPhone,
        packageId: payment.packageId,
        packageName: payment.packageName,
        amount: payment.amount,
        paymentMethod: "Pesapal",
        providerLabel: "Pesapal",
        reference: payment.merchantReference,
        placeholderPhoneSeed: `pesapal-${payment.id}`,
      });

      return tx.pesapalPayment.update({
        where: { merchantReference },
        data: { status: "COMPLETED", pesapalTrackingId: orderTrackingId, leadId },
      });
    });
  }

  if (txStatus.status_code === 2 || txStatus.status_code === 3) {
    return db.pesapalPayment.update({
      where: { merchantReference },
      data: { status: "FAILED", pesapalTrackingId: orderTrackingId },
    });
  }

  // status_code 0 — invalid or still pending; just record the tracking id.
  return db.pesapalPayment.update({
    where: { merchantReference },
    data: { pesapalTrackingId: orderTrackingId },
  });
}
