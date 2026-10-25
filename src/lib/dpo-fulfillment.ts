import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/dpo";
import { recordOnlinePayment } from "@/lib/online-fulfillment";

/**
 * Checks a DPO transaction's real status and, the first time it is seen as
 * paid, creates/updates the Lead and records a Payment.
 *
 * Called from the browser redirect and the reconcile sweep, so it has to be
 * idempotent: once a DpoPayment is COMPLETED or FAILED, later calls are
 * no-ops. The payment is re-read inside the transaction because the redirect
 * and the sweep can land at once — the second must see the first's COMPLETED
 * and stop, rather than book the money twice.
 */
export async function fulfillDpoPayment(merchantReference: string) {
  const db = getDb();

  const existing = await db.dpoPayment.findUnique({ where: { merchantReference } });
  if (!existing) return null;
  if (existing.status === "COMPLETED" || existing.status === "FAILED") return existing;

  // No token means createToken never returned one, so DPO has no transaction
  // to ask about. Only the reconcile sweep can retire the row.
  if (!existing.transToken) return existing;

  const status = await verifyToken(existing.transToken);

  if (status.outcome === "PAID") {
    // The amount is set server-side, so a mismatch should be impossible — but
    // booking a sale price DPO did not actually collect would put the wrong
    // revenue on the ledger. Leave it for staff instead of guessing.
    const expected = existing.chargedAmount ?? existing.amount;
    if (
      (status.amount !== null && Math.round(status.amount) !== expected) ||
      (status.currency !== null && status.currency !== existing.currency)
    ) {
      console.error(
        `[DPO] ${merchantReference} paid ${status.amount} ${status.currency}, expected ${expected} ${existing.currency}`,
      );
      return db.dpoPayment.update({
        where: { merchantReference },
        data: {
          failureReason: `Paid ${status.amount} ${status.currency}, expected ${expected} ${existing.currency}: check in DPO before booking`,
        },
      });
    }

    return db.$transaction(async (tx) => {
      const payment = await tx.dpoPayment.findUnique({ where: { merchantReference } });
      if (!payment || payment.status === "COMPLETED" || payment.status === "FAILED") return payment;

      const leadId = await recordOnlinePayment(tx, {
        leadId: payment.leadId,
        subscriptionId: payment.subscriptionId,
        source: payment.source,
        customerName: payment.customerName,
        customerPhone: payment.customerPhone,
        packageId: payment.packageId,
        packageName: payment.packageName,
        amount: payment.amount,
        paymentMethod: "DPO Pay",
        providerLabel: payment.testMode ? "DPO Pay (test mode)" : "DPO Pay",
        reference: payment.merchantReference,
        placeholderPhoneSeed: `dpo-${payment.id}`,
      });

      return tx.dpoPayment.update({
        where: { merchantReference },
        data: { status: "COMPLETED", failureReason: null, leadId },
      });
    });
  }

  if (status.outcome === "FAILED") {
    return db.dpoPayment.update({
      where: { merchantReference },
      data: { status: "FAILED", failureReason: status.explanation },
    });
  }

  // Not paid yet, or still with the bank.
  return existing;
}
