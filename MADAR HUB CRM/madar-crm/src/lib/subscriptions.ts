import type { Prisma } from "@prisma/client";
import { ACTIVE_MEMBER_STATUSES } from "@/lib/constants";
import { getMembershipPaymentStatus, isRecurringBillingType, type MembershipPaymentInfo } from "@/lib/membership";

/**
 * A person (Lead) can hold several subscriptions — Zuna Real Estate, Zuna
 * Logistics and Zuna Trio under one contact. Each renews on its own: its due
 * date follows from the latest payment booked against it, never from the
 * person's other subscriptions.
 */

export const SUBSCRIPTION_STATUSES = ["active", "cancelled"] as const;

type NamedSubscription = { label: string | null; package?: { name: string } | null };

/** What staff and the member call a subscription: its label, else its plan. */
export function subscriptionName(sub: NamedSubscription): string {
  return sub.label?.trim() || sub.package?.name || "Membership";
}

/**
 * Payment status for one subscription. The subscription's own package is the
 * plan — it is kept current whenever a payment for another package is booked
 * against it — and the latest payment linked to it sets the due date.
 */
export function getSubscriptionPaymentStatus(
  sub: { package: { billingType: string; price: number } | null },
  latestPayment: { paymentDate: Date; amount: number } | null | undefined,
  now: Date = new Date(),
): MembershipPaymentInfo | null {
  return getMembershipPaymentStatus(sub.package, latestPayment?.paymentDate, latestPayment?.amount, now);
}

export class AmbiguousSubscriptionError extends Error {
  constructor() {
    super("This person has more than one subscription. Choose which one the payment is for.");
  }
}

export type ResolveSubscriptionInput = {
  leadId: string;
  packageId: string | null;
  /** A subscription id, "new" to open another one, or null to decide here. */
  requested: string | null;
  /** Label for a subscription opened by this payment. */
  newLabel?: string | null;
  /**
   * What to do when nothing was requested and the person already has more
   * than one active subscription, so there is no telling which one is meant:
   * "create" opens another (a portal member buying a further package),
   * "leave" books the payment unattached for staff to place, and "error"
   * refuses (staff recording it by hand, who can simply choose).
   */
  whenAmbiguous: "create" | "leave" | "error";
};

/**
 * Decides which subscription a payment renews, opening one if needed.
 *
 * A one-off purchase (day pass, meeting room) renews nothing and is never
 * attached. Otherwise an explicitly requested subscription wins; with none
 * requested, a person's only subscription is the obvious one — the same as a
 * single membership behaved before — and a person with none gets their first.
 *
 * Must run inside the transaction that books the payment.
 */
export async function resolvePaymentSubscription(
  tx: Prisma.TransactionClient,
  input: ResolveSubscriptionInput,
): Promise<string | null> {
  const pkg = input.packageId ? await tx.package.findUnique({ where: { id: input.packageId } }) : null;
  if (pkg && !isRecurringBillingType(pkg.billingType)) return null;

  const open = () =>
    tx.subscription.create({
      data: { leadId: input.leadId, packageId: input.packageId, label: input.newLabel?.trim() || null },
    });
  // A payment for another plan moves the subscription onto that plan; an
  // unassigned amount (a negotiated deal) leaves the plan as it was.
  const attach = async (id: string) => {
    if (input.packageId) {
      await tx.subscription.update({ where: { id }, data: { packageId: input.packageId } });
    }
    return id;
  };

  if (input.requested === "new") return (await open()).id;

  if (input.requested) {
    // Only ever one of this person's own subscriptions — a stale or forged id
    // must not move money onto somebody else's account.
    const sub = await tx.subscription.findFirst({
      where: { id: input.requested, leadId: input.leadId },
      select: { id: true, status: true },
    });
    if (sub) {
      if (sub.status !== "active") {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "active", cancelledAt: null } });
      }
      return attach(sub.id);
    }
  }

  const active = await tx.subscription.findMany({
    where: { leadId: input.leadId, status: "active" },
    select: { id: true },
  });
  if (active.length === 1) return attach(active[0].id);

  if (active.length === 0) {
    // An unassigned amount only starts a subscription for someone who is
    // already a member; for anyone else it is a custom one-off charge.
    if (!pkg) {
      const lead = await tx.lead.findUnique({ where: { id: input.leadId }, select: { status: true } });
      if (!lead || !(ACTIVE_MEMBER_STATUSES as readonly string[]).includes(lead.status)) return null;
    }
    return (await open()).id;
  }

  if (input.whenAmbiguous === "create") return (await open()).id;
  if (input.whenAmbiguous === "error") throw new AmbiguousSubscriptionError();
  return null;
}
