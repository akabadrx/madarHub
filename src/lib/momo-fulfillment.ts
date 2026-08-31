import { getDb } from "@/lib/db";
import { describeMomoReason, getRequestToPayStatus } from "@/lib/momo";
import { recordOnlinePayment } from "@/lib/online-fulfillment";

/**
 * Checks a MoMo prompt's real status and, the first time it is seen as
 * successful, creates/updates the Lead and records a Payment.
 *
 * Called from the status endpoints the customer's browser polls and from the
 * reconcile sweep, so it has to be idempotent: once a MomoPayment is COMPLETED
 * or FAILED, later calls are no-ops. The payment is re-read inside the
 * transaction because two polls can land at once — the second must see the
 * first's COMPLETED and stop, rather than book the money twice.
 */
export async function fulfillMomoPayment(merchantReference: string) {
  const db = getDb();

  const existing = await db.momoPayment.findUnique({ where: { merchantReference } });
  if (!existing) return null;
  if (existing.status === "COMPLETED" || existing.status === "FAILED") return existing;

  // No reference id means requestToPay never returned one, so MTN has no
  // transaction to ask about. Only the reconcile sweep can retire the row.
  if (!existing.momoReferenceId) return existing;

  const status = await getRequestToPayStatus(existing.momoReferenceId);

  if (status.status === "SUCCESSFUL") {
    return db.$transaction(async (tx) => {
      const payment = await tx.momoPayment.findUnique({ where: { merchantReference } });
      if (!payment || payment.status === "COMPLETED" || payment.status === "FAILED") return payment;

      const leadId = await recordOnlinePayment(tx, {
        leadId: payment.leadId,
        customerName: payment.customerName,
        customerPhone: payment.customerPhone,
        packageId: payment.packageId,
        packageName: payment.packageName,
        amount: payment.amount,
        paymentMethod: "MoMo Pay",
        providerLabel: "MTN MoMo",
        reference: payment.merchantReference,
        placeholderPhoneSeed: `momo-${payment.id}`,
      });

      return tx.momoPayment.update({
        where: { merchantReference },
        data: { status: "COMPLETED", leadId },
      });
    });
  }

  if (status.status === "FAILED") {
    // MTN's reason is the difference between "wrong PIN" and "not enough
    // money" — worth keeping, because staff are the ones who get asked.
    return db.momoPayment.update({
      where: { merchantReference },
      data: { status: "FAILED", failureReason: describeMomoReason(status.reason) },
    });
  }

  // PENDING — the customer has not answered the prompt yet.
  return existing;
}
