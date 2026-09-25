// Mirrors the CRM's src/lib/membership.ts so members and staff see the same
// status for the same account. Keep the two in step if the grace period or the
// billing rules change.

export const PAYMENT_GRACE_PERIOD_DAYS = 7;

/** Months one payment covers, keyed by Package.billingType. Unlisted types are one-offs. */
const BILLING_PERIOD_MONTHS: Record<string, number> = {
  monthly: 1,
  "6-months": 6,
  "12-months": 12,
};

/** Months one payment covers, or null for a one-off billing type. */
export function billingPeriodMonths(billingType: string): number | null {
  return BILLING_PERIOD_MONTHS[billingType] ?? null;
}

export type MembershipPaymentStatus = "Active" | "Delayed Payment" | "Suspended";

export type MembershipPaymentInfo = {
  status: MembershipPaymentStatus;
  nextPaymentDate: Date;
  dueAmount: number;
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
 * The next payment falls one billing period (1, 6 or 12 months) after the last
 * one. A member with no package assigned is still treated as monthly, using
 * what they last paid as the recurring amount — the CRM does the same. Only a
 * one-off package, or no payment history, opts them out.
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
    const daysUntilSuspension = Math.max(
      0,
      Math.ceil((suspensionDate.getTime() - now.getTime()) / 86_400_000),
    );
    return { status: "Delayed Payment", nextPaymentDate, dueAmount: renewalAmount, daysUntilSuspension };
  }
  return { status: "Suspended", nextPaymentDate, dueAmount: renewalAmount, daysUntilSuspension: 0 };
}
