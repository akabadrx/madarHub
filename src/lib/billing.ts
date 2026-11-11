import { createHash } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getMembershipPaymentStatus, PAYMENT_GRACE_PERIOD_DAYS, type MembershipPaymentInfo } from "@/lib/membership";
import { saleAmountWithVat } from "@/lib/pricing";

/**
 * Custom prices and the Loyalty Rate.
 *
 * A price override replaces one subscription's plan price in every checkout,
 * reminder and receipt. The Loyalty Rate is simply an override of kind
 * "loyalty": 85,000 RWF a month VAT inclusive with a 12-month commitment, on
 * the member's own monthly Virtual Address subscription. It is not a package,
 * so it can never appear on /pricing or in any public list.
 *
 * Every Loyalty figure lives here and nowhere else. The portal shows what the
 * CRM sends it.
 */
export const LOYALTY = {
  /** The monthly plan the Loyalty Rate discounts, and the only one it applies to. */
  packageSlug: "virtual-business-address",
  /** VAT inclusive: base 72,034 + 18% VAT. */
  monthlyTotal: 85_000,
  commitmentMonths: 12,
  /** Successful, consecutive payments at the standard price before the offer appears. */
  qualifyingPayments: 2,
  /** Days the company has to amend its RDB registered address after the plan ends. */
  addressAmendmentDays: 7,
  /**
   * The price once all 12 Loyalty months are paid. "keep" stays at 85,000
   * (decided 2026-11-11); "standard" would return to the plan's price from
   * the next cycle.
   */
  afterCommitment: "keep" as "keep" | "standard",
};

/**
 * Two payments closer than this are one period paid twice (a double booking),
 * not two consecutive months.
 */
const MIN_DAYS_BETWEEN_MONTHLY_PAYMENTS = 20;

const DAY_MS = 86_400_000;

type Db = PrismaClient | Prisma.TransactionClient;
export type BillingPayment = { paymentDate: Date; amount: number; packageId?: string | null };
export type OverrideTerms = {
  kind: string;
  amount: number;
  vatInclusive: boolean;
  effectiveFrom: Date;
  commitmentMonths: number | null;
  terms: string | null;
  termsVersion: string | null;
  note: string | null;
  createdAt: Date;
};

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function rwf(value: number) {
  return value.toLocaleString("en-US");
}

/** What the member pays each month under an override, VAT included. */
export function overrideMonthlyTotal(o: { amount: number; vatInclusive: boolean }) {
  return o.vatInclusive ? o.amount : saleAmountWithVat(o.amount);
}

/**
 * How far into its commitment an override is. A month counts once it is paid
 * at the override's price on or after the override started, so the months a
 * member paid at the standard price before switching are never counted.
 */
export function commitmentProgress(o: OverrideTerms, payments: BillingPayment[]) {
  const total = overrideMonthlyTotal(o);
  const since = o.effectiveFrom < o.createdAt ? o.effectiveFrom : o.createdAt;
  const paid = payments
    .filter((p) => p.paymentDate >= since && p.amount === total)
    .map((p) => p.paymentDate)
    .sort((a, b) => a.getTime() - b.getTime());
  const months = o.commitmentMonths ?? 0;
  const startDate = paid[0] ?? null;
  return {
    monthsPaid: paid.length,
    startDate,
    endDate: startDate && months ? addMonths(startDate, months) : null,
    complete: months > 0 && paid.length >= months,
  };
}

/**
 * What a member owes if the plan ends now: the discount on every month paid
 * at the override price, reversed. Nothing once the commitment is complete,
 * and nothing when there is no commitment.
 */
export function earlyTerminationPenalty(o: OverrideTerms, standardTotal: number | null, monthsPaid: number) {
  if (!o.commitmentMonths || monthsPaid >= o.commitmentMonths || standardTotal === null) return 0;
  return Math.max(0, standardTotal - overrideMonthlyTotal(o)) * monthsPaid;
}

/**
 * Whether the override prices the cycle being paid for now. That cycle starts
 * at the next due date, or today for a member who is already overdue.
 */
export function overrideApplies(o: OverrideTerms, nextPaymentDate: Date | null, complete: boolean, now = new Date()) {
  if (o.kind === "loyalty" && complete && LOYALTY.afterCommitment === "standard") return false;
  const cycleStart = nextPaymentDate && nextPaymentDate > now ? nextPaymentDate : now;
  return cycleStart >= o.effectiveFrom;
}

/** The plain-English commitment terms a member accepts. */
export function commitmentTerms(input: { label: string; months: number; standardTotal: number; monthlyTotal: number }) {
  const diff = input.standardTotal - input.monthlyTotal;
  return [
    `Minimum commitment: ${input.months} months from your first ${input.label} payment.`,
    `Early termination: if the plan ends before ${input.months} ${input.label} months are paid, for any reason including non-payment past the ${PAYMENT_GRACE_PERIOD_DAYS}-day grace period, the discount is reversed. You then owe ${rwf(diff)} RWF (${rwf(input.standardTotal)} − ${rwf(input.monthlyTotal)}) for each ${input.label} month paid. For example, ending after 4 months means ${rwf(diff * 4)} RWF. This is payable before the termination takes effect. Months paid earlier at ${rwf(input.standardTotal)} RWF are not counted.`,
    `When the plan ends, your company must amend its RDB registered address within ${LOYALTY.addressAmendmentDays} days and send Madar Hub confirmation. Otherwise Madar Hub will inform RDB.`,
    "This agreement is governed by the laws of the Republic of Rwanda.",
  ].join("\n\n");
}

export function loyaltyTerms(standardTotal: number) {
  return commitmentTerms({ label: "Loyalty", months: LOYALTY.commitmentMonths, standardTotal, monthlyTotal: LOYALTY.monthlyTotal });
}

/** A short hash of the terms text: any edit makes a new version to accept. */
export function termsVersion(terms: string) {
  return createHash("sha256").update(terms).digest("hex").slice(0, 16);
}

export type Eligibility = { eligible: true } | { eligible: false; reason: string };

/**
 * Whether a subscription may switch itself to the Loyalty Rate. Its latest two
 * payments must both be the monthly Virtual Address plan at the standard price,
 * for consecutive months (the later one paid before the earlier one's grace
 * period ended), and the plan must still be running.
 */
export function loyaltyEligibility(input: {
  subscriptionStatus: string;
  packageId: string | null;
  loyaltyPackageId: string;
  standardTotal: number;
  hasOverride: boolean;
  unpaidPenalty: boolean;
  payments: BillingPayment[];
  now?: Date;
}): Eligibility {
  const now = input.now ?? new Date();
  if (input.unpaidPenalty) return { eligible: false, reason: "There is an unpaid early-termination penalty." };
  if (input.subscriptionStatus !== "active") return { eligible: false, reason: "The plan is cancelled." };
  if (input.packageId !== input.loyaltyPackageId) return { eligible: false, reason: "Not on the monthly Virtual Address plan." };
  if (input.hasOverride) return { eligible: false, reason: "Already on the Loyalty Rate or a custom price." };

  const recent = [...input.payments].sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime()).slice(0, LOYALTY.qualifyingPayments);
  if (recent.length < LOYALTY.qualifyingPayments) return { eligible: false, reason: `Needs ${LOYALTY.qualifyingPayments} monthly payments.` };
  if (recent.some((p) => p.packageId !== input.loyaltyPackageId || p.amount !== input.standardTotal)) {
    return { eligible: false, reason: "The latest payments are not monthly Virtual Address payments at the standard price." };
  }
  for (let i = 0; i < recent.length - 1; i++) {
    const later = recent[i].paymentDate;
    const earlier = recent[i + 1].paymentDate;
    const graceEnd = addMonths(earlier, 1).getTime() + PAYMENT_GRACE_PERIOD_DAYS * DAY_MS;
    if (later.getTime() > graceEnd || later.getTime() - earlier.getTime() < MIN_DAYS_BETWEEN_MONTHLY_PAYMENTS * DAY_MS) {
      return { eligible: false, reason: "The payments are not for consecutive months." };
    }
  }
  const status = getMembershipPaymentStatus({ billingType: "monthly", price: 0 }, recent[0].paymentDate, 0, now);
  if (!status || status.status === "Suspended") return { eligible: false, reason: "The plan has lapsed past its grace period." };
  return { eligible: true };
}

type BillingSubscription = {
  id: string;
  status: string;
  packageId: string | null;
  package: { price: number; billingType: string } | null;
  priceOverride: OverrideTerms | null;
};

/**
 * Everything about what one subscription costs, as of now. `payments` are the
 * ones booked against it, newest first. `info` is the usual payment status,
 * with the amount due replaced by the override's price when that applies.
 */
export function describeBilling(sub: BillingSubscription, payments: BillingPayment[], acceptedVersions: string[], now = new Date()) {
  const standardTotal = sub.package ? saleAmountWithVat(sub.package.price) : null;
  const latest = payments[0];
  const baseInfo = getMembershipPaymentStatus(sub.package, latest?.paymentDate, latest?.amount, now);
  const renewalAmount = sub.package?.price ?? latest?.amount ?? 0;
  const o = sub.priceOverride;
  if (!o) return { standardTotal, info: baseInfo, renewalAmount, override: null };

  const progress = commitmentProgress(o, payments);
  const monthlyTotal = overrideMonthlyTotal(o);
  const applies = overrideApplies(o, baseInfo?.nextPaymentDate ?? null, progress.complete, now);
  const info: MembershipPaymentInfo | null =
    baseInfo && applies && baseInfo.dueAmount > 0 ? { ...baseInfo, dueAmount: monthlyTotal } : baseInfo;
  return {
    standardTotal,
    info,
    renewalAmount: applies ? monthlyTotal : renewalAmount,
    override: {
      ...o,
      ...progress,
      monthlyTotal,
      applies,
      penaltyIfCancelledToday: earlyTerminationPenalty(o, standardTotal, progress.monthsPaid),
      // Only a commitment needs consent; a plain price change is just shown.
      termsAccepted: !o.commitmentMonths || (o.termsVersion !== null && acceptedVersions.includes(o.termsVersion)),
    },
  };
}

export type SubscriptionBilling = ReturnType<typeof describeBilling> & { subscriptionId: string; packageId: string | null };

/** Loads one subscription and describes its billing. */
export async function subscriptionBilling(db: Db, subscriptionId: string, now = new Date()): Promise<SubscriptionBilling | null> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      package: true,
      priceOverride: true,
      payments: { orderBy: { paymentDate: "desc" }, select: { paymentDate: true, amount: true, packageId: true } },
      termsAcceptances: { select: { termsVersion: true } },
    },
  });
  if (!sub) return null;
  const accepted = sub.termsAcceptances.map((a) => a.termsVersion);
  return { subscriptionId: sub.id, packageId: sub.packageId, ...describeBilling(sub, sub.payments, accepted, now) };
}

export async function unpaidPenalty(db: Db, leadId: string) {
  const owed = await db.subscription.aggregate({
    where: { leadId, penaltyAmount: { gt: 0 }, penaltyPaidAt: null },
    _sum: { penaltyAmount: true },
  });
  return owed._sum.penaltyAmount ?? 0;
}

export const UNPAID_PENALTY_MESSAGE =
  "There is an unpaid early-termination balance on your account. Please contact Madar Hub to settle it before buying a new plan.";
export const TERMS_PENDING_MESSAGE =
  "Please read and accept your plan's new terms on your membership page before paying.";

/**
 * The VAT-inclusive amount a portal checkout charges, decided from the
 * database alone. The browser only ever names a package and a subscription.
 */
export function priceForCheckout(pkg: { id: string; price: number }, billing: SubscriptionBilling | null) {
  const o = billing?.override;
  if (!billing || !o || billing.packageId !== pkg.id || !o.applies) {
    return { saleAmount: saleAmountWithVat(pkg.price), subscriptionId: null as string | null };
  }
  if (!o.termsAccepted) return { error: TERMS_PENDING_MESSAGE };
  return { saleAmount: o.monthlyTotal, subscriptionId: billing.subscriptionId as string | null };
}

/**
 * Checks and prices a portal checkout. Refuses a member with an unpaid
 * penalty, and one whose committed price has terms they have not accepted.
 *
 * With no subscription named, fulfilment books the payment onto the member's
 * only active subscription, so the price is taken from that one too, and the
 * subscription is returned so fulfilment cannot place it anywhere else.
 */
export async function portalCheckoutPrice(
  db: Db,
  input: { leadId: string | null; subscriptionId: string | null; pkg: { id: string; price: number } },
  now = new Date(),
): Promise<{ error: string } | { saleAmount: number; subscriptionId: string | null }> {
  if (!input.leadId) return { saleAmount: saleAmountWithVat(input.pkg.price), subscriptionId: input.subscriptionId };
  if ((await unpaidPenalty(db, input.leadId)) > 0) return { error: UNPAID_PENALTY_MESSAGE };

  let subscriptionId = input.subscriptionId;
  if (!subscriptionId) {
    const active = await db.subscription.findMany({ where: { leadId: input.leadId, status: "active" }, select: { id: true } });
    if (active.length === 1) subscriptionId = active[0].id;
  }
  const billing = subscriptionId ? await subscriptionBilling(db, subscriptionId, now) : null;
  const price = priceForCheckout(input.pkg, billing);
  if ("error" in price) return price;
  return { saleAmount: price.saleAmount, subscriptionId: price.subscriptionId ?? input.subscriptionId };
}

/**
 * The member's Loyalty offer, if any of their subscriptions qualifies. Checked
 * here, on the server, both when the card is shown and again when it is
 * accepted.
 */
export async function findLoyaltyOffer(db: Db, leadId: string, now = new Date()) {
  const pkg = await db.package.findUnique({ where: { slug: LOYALTY.packageSlug } });
  if (!pkg || !pkg.active) return null;
  const penalty = await unpaidPenalty(db, leadId);
  const subs = await db.subscription.findMany({
    where: { leadId, status: "active", packageId: pkg.id },
    include: { priceOverride: true, payments: { orderBy: { paymentDate: "desc" }, take: LOYALTY.qualifyingPayments } },
    orderBy: { createdAt: "asc" },
  });
  const standardTotal = saleAmountWithVat(pkg.price);
  for (const sub of subs) {
    const check = loyaltyEligibility({
      subscriptionStatus: sub.status,
      packageId: sub.packageId,
      loyaltyPackageId: pkg.id,
      standardTotal,
      hasOverride: Boolean(sub.priceOverride),
      unpaidPenalty: penalty > 0,
      payments: sub.payments,
      now,
    });
    if (!check.eligible) continue;
    const info = getMembershipPaymentStatus(pkg, sub.payments[0]?.paymentDate, sub.payments[0]?.amount, now);
    const terms = loyaltyTerms(standardTotal);
    return {
      subscriptionId: sub.id,
      packageSlug: pkg.slug as string,
      standardTotal,
      monthlyTotal: LOYALTY.monthlyTotal,
      commitmentMonths: LOYALTY.commitmentMonths,
      terms,
      termsVersion: termsVersion(terms),
      // The Loyalty Rate starts with the next unpaid cycle, so a member who is
      // paid up keeps the rest of the month they already paid for.
      startsOn: info?.nextPaymentDate ?? now,
      dueNow: Boolean(info && info.status !== "Active"),
    };
  }
  return null;
}

/**
 * Ends a subscription and, when it is inside a commitment, records the
 * early-termination penalty it owes. While that penalty is unpaid the portal
 * refuses the member every new purchase. Must run inside a transaction.
 */
export async function terminateSubscription(tx: Prisma.TransactionClient, subscriptionId: string, changedBy: string, note: string | null) {
  const billing = await subscriptionBilling(tx, subscriptionId);
  if (!billing) throw new Error("Subscription not found");
  const penalty = billing.override?.penaltyIfCancelledToday ?? 0;
  const now = new Date();
  const sub = await tx.subscription.update({
    where: { id: subscriptionId },
    data: { status: "cancelled", cancelledAt: now, terminatedAt: now, penaltyAmount: penalty, penaltyPaidAt: null },
  });
  await tx.billingAuditLog.create({
    data: { leadId: sub.leadId, subscriptionId, action: "terminated", changedBy, oldAmount: billing.override?.monthlyTotal ?? null, newAmount: penalty, note },
  });
  return { leadId: sub.leadId, penalty };
}
