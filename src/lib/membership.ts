/** Grace period after a member's next payment date before they're suspended. */
export const PAYMENT_GRACE_PERIOD_DAYS = 7;

/**
 * How many months one payment covers, keyed by Package.billingType. A prepaid
 * plan is still a membership — it just renews less often — so a 12-month payer
 * must not be chased a month after paying. Anything not listed (day pass,
 * hourly, one-time) is a one-off and is never renewed.
 */
const BILLING_PERIOD_MONTHS: Record<string, number> = {
  monthly: 1,
  "6-months": 6,
  "12-months": 12,
};

/** Months one payment covers, or null for a one-off billing type. */
export function billingPeriodMonths(billingType: string): number | null {
  return BILLING_PERIOD_MONTHS[billingType] ?? null;
}

/** True for any billing type that renews — monthly or a prepaid multi-month plan. */
export function isRecurringBillingType(billingType: string): boolean {
  return billingPeriodMonths(billingType) !== null;
}

export type MembershipPaymentStatus = "Active" | "Delayed Payment" | "Suspended";

export type MembershipPaymentInfo = {
  status: MembershipPaymentStatus;
  nextPaymentDate: Date;
  dueAmount: number;
  /** Days left before suspension; 0 once suspended. */
  daysUntilSuspension: number;
};

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Derives a member's next payment date and payment status from their last
 * payment and the period their package covers. A member with no package
 * assigned (a custom/negotiated deal, not tracked in the Packages list) is
 * still treated as monthly — that's the default billing cadence for an active
 * member — using what they last paid as the recurring due amount. Only a
 * one-off package (day pass, hourly, one-time) or no payment history yet opts
 * a member out.
 */
export function getMembershipPaymentStatus(
  pkg: { billingType: string; price: number } | null | undefined,
  lastPaymentDate: Date | null | undefined,
  lastPaymentAmount: number = 0,
  now: Date = new Date(),
): MembershipPaymentInfo | null {
  if (!lastPaymentDate) return null;
  const periodMonths = pkg ? billingPeriodMonths(pkg.billingType) : 1;
  if (!periodMonths) return null;
  const renewalAmount = pkg?.price ?? lastPaymentAmount;

  const nextPaymentDate = addMonths(lastPaymentDate, periodMonths);
  const suspensionDate = addDays(nextPaymentDate, PAYMENT_GRACE_PERIOD_DAYS);

  if (now <= nextPaymentDate) {
    return { status: "Active", nextPaymentDate, dueAmount: 0, daysUntilSuspension: PAYMENT_GRACE_PERIOD_DAYS };
  }
  if (now <= suspensionDate) {
    const daysUntilSuspension = Math.max(0, Math.ceil((suspensionDate.getTime() - now.getTime()) / 86_400_000));
    return { status: "Delayed Payment", nextPaymentDate, dueAmount: renewalAmount, daysUntilSuspension };
  }
  return { status: "Suspended", nextPaymentDate, dueAmount: renewalAmount, daysUntilSuspension: 0 };
}
