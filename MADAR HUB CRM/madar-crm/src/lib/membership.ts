/** Grace period after a monthly member's next payment date before they're suspended. */
export const PAYMENT_GRACE_PERIOD_DAYS = 7;

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
 * Derives a monthly member's next payment date and payment status from their
 * last payment. Returns null for non-monthly packages or members with no
 * payment history yet (nothing to project a due date from).
 */
export function getMembershipPaymentStatus(
  pkg: { billingType: string; price: number } | null | undefined,
  lastPaymentDate: Date | null | undefined,
  now: Date = new Date(),
): MembershipPaymentInfo | null {
  if (!pkg || pkg.billingType !== "monthly" || !lastPaymentDate) return null;

  const nextPaymentDate = addMonths(lastPaymentDate, 1);
  const suspensionDate = addDays(nextPaymentDate, PAYMENT_GRACE_PERIOD_DAYS);

  if (now <= nextPaymentDate) {
    return { status: "Active", nextPaymentDate, dueAmount: 0, daysUntilSuspension: PAYMENT_GRACE_PERIOD_DAYS };
  }
  if (now <= suspensionDate) {
    const daysUntilSuspension = Math.max(0, Math.ceil((suspensionDate.getTime() - now.getTime()) / 86_400_000));
    return { status: "Delayed Payment", nextPaymentDate, dueAmount: pkg.price, daysUntilSuspension };
  }
  return { status: "Suspended", nextPaymentDate, dueAmount: pkg.price, daysUntilSuspension: 0 };
}
