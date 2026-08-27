// Mirrors the CRM's src/lib/membership.ts so members and staff see the same
// status for the same account. Keep the two in step if the grace period or the
// billing rules change.

export const PAYMENT_GRACE_PERIOD_DAYS = 7;

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
 * A member with no package assigned is still treated as monthly, using what
 * they last paid as the recurring amount — the CRM does the same. Only an
 * explicitly non-monthly package, or no payment history, opts them out.
 */
export function getMembershipPaymentStatus(
  pkg: { billingType: string; price: number } | null | undefined,
  lastPaymentDate: Date | null | undefined,
  lastPaymentAmount: number = 0,
  now: Date = new Date(),
): MembershipPaymentInfo | null {
  if (!lastPaymentDate || (pkg && pkg.billingType !== "monthly")) return null;
  const monthlyAmount = pkg?.price ?? lastPaymentAmount;

  const nextPaymentDate = addMonths(lastPaymentDate, 1);
  const suspensionDate = addDays(nextPaymentDate, PAYMENT_GRACE_PERIOD_DAYS);

  if (now <= nextPaymentDate) {
    return { status: "Active", nextPaymentDate, dueAmount: 0, daysUntilSuspension: PAYMENT_GRACE_PERIOD_DAYS };
  }
  if (now <= suspensionDate) {
    const daysUntilSuspension = Math.max(
      0,
      Math.ceil((suspensionDate.getTime() - now.getTime()) / 86_400_000),
    );
    return { status: "Delayed Payment", nextPaymentDate, dueAmount: monthlyAmount, daysUntilSuspension };
  }
  return { status: "Suspended", nextPaymentDate, dueAmount: monthlyAmount, daysUntilSuspension: 0 };
}
