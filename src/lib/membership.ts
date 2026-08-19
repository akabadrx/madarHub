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
 * last payment. A member with no package assigned (a custom/negotiated deal,
 * not tracked in the Packages list) is still treated as monthly — that's the
 * default billing cadence for an active member — using what they last paid
 * as the recurring due amount. Only an explicitly non-monthly package (day
 * pass, hourly, one-time) or no payment history yet opts a member out.
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
    const daysUntilSuspension = Math.max(0, Math.ceil((suspensionDate.getTime() - now.getTime()) / 86_400_000));
    return { status: "Delayed Payment", nextPaymentDate, dueAmount: monthlyAmount, daysUntilSuspension };
  }
  return { status: "Suspended", nextPaymentDate, dueAmount: monthlyAmount, daysUntilSuspension: 0 };
}
