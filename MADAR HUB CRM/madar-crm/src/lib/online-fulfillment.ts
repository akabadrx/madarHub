import type { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/utils";

/**
 * The part of online-payment fulfilment that is the same whoever took the
 * money: find or create the Lead, book a Payment against it, and leave an
 * interaction trail.
 *
 * Pesapal and MoMo differ only in how they learn a payment succeeded, not in
 * what a successful payment means to the CRM — keeping this in one place is
 * what stops the two channels from booking revenue differently.
 *
 * Must be called inside a transaction: the Lead lookup, the Payment insert and
 * the running total are one unit, or a retried notification double-books.
 */
export type OnlinePaymentInput = {
  /** Known upfront for a portal order; null for a public one, which is matched by phone. */
  leadId: string | null;
  customerName: string;
  customerPhone: string | null;
  packageId: string | null;
  packageName: string;
  /** VAT-inclusive sale price — what the CRM books, never the surcharged figure. */
  amount: number;
  /** A value from PAYMENT_METHODS: "Pesapal" or "MoMo Pay". */
  paymentMethod: string;
  /** Human label for the provider, used in the note and interaction text. */
  providerLabel: string;
  /** The provider's own reference, so a booking can be traced back. */
  reference: string;
  /** Used to build a placeholder phone when a public payer has no usable number. */
  placeholderPhoneSeed: string;
};

export async function recordOnlinePayment(
  tx: Prisma.TransactionClient,
  input: OnlinePaymentInput,
): Promise<string> {
  // A membership-portal order already carries the Lead of the signed-in
  // member, so there is nothing to guess. Only a public order has to be
  // matched back to a person by phone number.
  let lead = input.leadId ? await tx.lead.findUnique({ where: { id: input.leadId } }) : null;

  const phone = input.customerPhone ? normalizePhone(input.customerPhone) : null;
  if (!lead && phone) {
    lead = await tx.lead.findFirst({ where: { phone } });
  }

  if (!lead) {
    // The status has to follow what was actually bought. Booking every online
    // payer as a day pass told a member who paid for a monthly package that
    // they were on a day pass.
    const pkg = input.packageId ? await tx.package.findUnique({ where: { id: input.packageId } }) : null;
    const status = pkg?.billingType === "monthly" ? "Paid Monthly" : "Paid Day Pass";

    lead = await tx.lead.create({
      data: {
        name: input.customerName,
        phone: phone || input.placeholderPhoneSeed,
        source: "Website",
        interest: input.packageName,
        suggestedPackageId: input.packageId,
        status,
        paymentStatus: "Paid",
        amountPaid: input.amount,
        notes: `Created from an online ${input.providerLabel} payment for ${input.packageName}.`,
      },
    });
  }

  await tx.payment.create({
    data: {
      leadId: lead.id,
      packageId: input.packageId,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      notes: `Online payment. ${input.providerLabel} ref ${input.reference}.`,
    },
  });

  const aggregate = await tx.payment.aggregate({ where: { leadId: lead.id }, _sum: { amount: true } });
  await tx.lead.update({
    where: { id: lead.id },
    data: { amountPaid: aggregate._sum.amount || input.amount, paymentStatus: "Paid" },
  });

  await tx.interaction.create({
    data: {
      leadId: lead.id,
      type: "payment",
      content: `Paid ${input.amount.toLocaleString()} RWF for ${input.packageName} via ${input.providerLabel} (online checkout)`,
    },
  });

  return lead.id;
}
