import { getDb } from "@/lib/db";
import { getTransactionStatus } from "@/lib/pesapal";
import { normalizePhone } from "@/lib/utils";

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

      const phone = payment.customerPhone ? normalizePhone(payment.customerPhone) : null;
      let lead = phone ? await tx.lead.findFirst({ where: { phone } }) : null;

      if (!lead) {
        lead = await tx.lead.create({
          data: {
            name: payment.customerName,
            phone: phone || `pesapal-${payment.id}`,
            source: "Website",
            interest: payment.packageName,
            suggestedPackageId: payment.packageId,
            status: "Paid Day Pass",
            paymentStatus: "Paid",
            amountPaid: payment.amount,
            notes: `Created from an online Pesapal payment for ${payment.packageName}.`,
          },
        });
      }

      await tx.payment.create({
        data: {
          leadId: lead.id,
          packageId: payment.packageId,
          amount: payment.amount,
          paymentMethod: "Pesapal",
          notes: `Online payment. Pesapal ref ${payment.merchantReference}.`,
        },
      });

      const aggregate = await tx.payment.aggregate({ where: { leadId: lead.id }, _sum: { amount: true } });
      await tx.lead.update({
        where: { id: lead.id },
        data: { amountPaid: aggregate._sum.amount || payment.amount, paymentStatus: "Paid" },
      });

      await tx.interaction.create({
        data: {
          leadId: lead.id,
          type: "payment",
          content: `Paid ${payment.amount.toLocaleString()} RWF for ${payment.packageName} via Pesapal (online checkout)`,
        },
      });

      return tx.pesapalPayment.update({
        where: { merchantReference },
        data: { status: "COMPLETED", pesapalTrackingId: orderTrackingId, leadId: lead.id },
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
