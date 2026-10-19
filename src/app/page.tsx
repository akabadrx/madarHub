import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PackagePicker } from "@/components/package-picker";
import { SubscriptionList, type SubscriptionItem } from "@/components/subscription-list";
import { isMomoAvailable } from "@/app/checkout-actions";
import { logout } from "@/app/auth-actions";
import { linkAccountToLead } from "@/app/checkout-actions";
import { getSessionUser } from "@/lib/session";
import {
  getActivePackages,
  getCurrentPackage,
  getLead,
  getPayments,
  getSubscriptions,
  type CrmPackage,
  type CrmSubscription,
} from "@/lib/crm";
import {
  billingPeriodMonths,
  getMembershipPaymentStatus,
  type MembershipPaymentInfo,
} from "@/lib/membership";
import { formatDate, formatRwf } from "@/lib/utils";

export const metadata: Metadata = { title: "My membership" };

export const dynamic = "force-dynamic";

const CHIP_CLASS: Record<string, string> = {
  Active: "active",
  "Delayed Payment": "delayed",
  Suspended: "suspended",
};

const PAYMENT_NOTICE: Record<string, { tone: string; text: string }> = {
  success: { tone: "success", text: "Payment received. Thank you — your membership is up to date." },
  pending: {
    tone: "info",
    text: "Your payment is still being confirmed. This page will update once it clears, usually within a few minutes.",
  },
  failed: {
    tone: "error",
    text: "That payment did not go through. Nothing has been charged — you can try again below.",
  },
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Worst first: the card's chip reports the subscription that most needs attention. */
const SEVERITY: Record<string, number> = { Suspended: 0, "Delayed Payment": 1, Active: 2 };

function subscriptionPackage(sub: CrmSubscription): CrmPackage | null {
  return sub.packageName && sub.billingType && sub.price !== null
    ? { name: sub.packageName, billingType: sub.billingType, price: sub.price }
    : null;
}

function subscriptionStatus(sub: CrmSubscription): MembershipPaymentInfo | null {
  return getMembershipPaymentStatus(subscriptionPackage(sub), sub.lastPaymentDate, sub.lastPaymentAmount ?? 0);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // An account can be created before the member exists in the CRM, and a Google
  // sign-up carries no phone at all. Retry the match on each visit so a member
  // is connected as soon as their record or number appears.
  const leadId = user.leadId ?? (await linkAccountToLead(user.id, user.email, user.phone));

  const params = await searchParams;
  const notice = params.payment ? PAYMENT_NOTICE[params.payment] : undefined;

  const lead = leadId ? await getLead(leadId) : null;

  const [payments, subscriptions, packages] = await Promise.all([
    lead ? getPayments(lead.id) : Promise.resolve([]),
    lead ? getSubscriptions(lead.id) : Promise.resolve([]),
    getActivePackages(),
  ]);

  // A member can hold several subscriptions — one per business — each due on
  // its own date. With one, the page reads exactly as a single membership did.
  const multiple = subscriptions.length > 1;
  const single = subscriptions.length === 1 ? subscriptions[0] : null;
  const statuses = subscriptions.map((sub) => ({ sub, info: subscriptionStatus(sub) }));

  // Someone with no subscription on record yet is billed lead-wide, as before.
  const currentPackage = single
    ? subscriptionPackage(single)
    : lead && subscriptions.length === 0
      ? await getCurrentPackage(lead.id)
      : null;
  const lastPayment = single
    ? single.lastPaymentDate
      ? { paymentDate: single.lastPaymentDate, amount: single.lastPaymentAmount ?? 0 }
      : null
    : (payments[0] ?? null);

  const membership = multiple
    ? (statuses
        .flatMap(({ info }) => (info ? [info] : []))
        .sort(
          (a, b) =>
            SEVERITY[a.status] - SEVERITY[b.status] ||
            a.nextPaymentDate.getTime() - b.nextPaymentDate.getTime(),
        )[0] ?? null)
    : lead
      ? getMembershipPaymentStatus(currentPackage, lastPayment?.paymentDate ?? null, lastPayment?.amount ?? 0)
      : null;

  const dueCount = statuses.filter(({ info }) => info && info.status !== "Active").length;
  const totalDue = statuses.reduce((sum, { info }) => sum + (info?.dueAmount ?? 0), 0);
  const earliestNext = statuses
    .flatMap(({ info }) => (info ? [info.nextPaymentDate] : []))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const subscriptionItems: SubscriptionItem[] = statuses.map(({ sub, info }) => ({
    id: sub.id,
    name: sub.label?.trim() || sub.packageName || "Membership",
    planName: sub.label?.trim() ? sub.packageName : null,
    packageSlug: sub.packageSlug,
    status: info?.status ?? null,
    nextPayment: info ? formatDate(info.nextPaymentDate) : null,
    dueText: info
      ? info.dueAmount > 0
        ? `${formatRwf(info.dueAmount)} due${
            info.status === "Delayed Payment"
              ? ` — ${plural(info.daysUntilSuspension, "day")} before suspension`
              : ""
          }`
        : "Nothing due yet"
      : "No payment recorded yet",
    isDue: Boolean(info && info.status !== "Active"),
  }));

  const currentSlug = multiple
    ? null
    : (single?.packageSlug ?? packages.find((p) => p.name === currentPackage?.name)?.slug ?? null);
  const momoAvailable = await isMomoAvailable();
  const paymentDue = membership?.status === "Delayed Payment" || membership?.status === "Suspended";
  const firstName = user.fullName.split(" ")[0] || "there";
  const status = membership?.status ?? "No active plan";
  const planAmount = currentPackage?.price ?? lastPayment?.amount ?? 0;
  // A plan with no package is billed monthly, like the status above assumes.
  const periodMonths = currentPackage ? billingPeriodMonths(currentPackage.billingType) : 1;
  const planCadence = periodMonths === 1 ? " per month" : periodMonths ? ` per ${periodMonths} months` : "";
  const oldestPayment = payments.length > 0 ? payments[payments.length - 1] : null;

  return (
    <>
      <SiteHeader signedIn />
      <main id="main" className="page-main">
        <div className="mp-dash">
          <div className="mp-dash-head">
            <div>
              <h1>Hello, {firstName}</h1>
              <p>{user.email}</p>
            </div>
            <div className="mp-dash-actions">
              <a href="/membership/profile">Your details</a>
              <form action={logout}>
                <button className="mp-logout" type="submit">
                  Log out
                </button>
              </form>
            </div>
          </div>

          {notice ? (
            <p className={`mp-alert ${notice.tone}`} role="status" style={{ marginBottom: 20 }}>
              {notice.text}
            </p>
          ) : null}

          {/* The membership itself, presented as an object rather than a row of
              equally weighted stat panels. */}
          <section className="mp-hero" aria-label="Your membership">
            <div className="mp-hero-top">
              <div>
                <p className="mp-hero-eyebrow">Madar Hub Membership</p>
                <h2 className="mp-hero-name">{user.fullName || lead?.name}</h2>
                <p className="mp-hero-meta">
                  {multiple
                    ? dueCount > 0
                      ? `${dueCount} of your ${subscriptions.length} subscriptions ${dueCount === 1 ? "needs" : "need"} payment.`
                      : `All ${subscriptions.length} subscriptions are up to date.`
                    : membership
                    ? membership.status === "Active"
                      ? "Your membership is up to date."
                      : membership.status === "Delayed Payment"
                        ? `Payment overdue — ${plural(membership.daysUntilSuspension, "day")} before suspension.`
                        : "Suspended. Renew below to reactivate."
                    : lead
                      ? "No subscription running right now."
                      : "Not connected to a membership yet."}
                </p>
              </div>
              <span className={`mp-chip ${CHIP_CLASS[status] ?? "none"}`}>{status}</span>
            </div>

            {multiple ? (
            <dl className="mp-figures">
              <div className="mp-figure">
                <dt>Subscriptions</dt>
                <dd>
                  {subscriptions.length}
                  <small>{dueCount > 0 ? `${dueCount} need${dueCount === 1 ? "s" : ""} payment` : "All up to date"}</small>
                </dd>
              </div>
              <div className="mp-figure">
                <dt>Next payment</dt>
                <dd className={totalDue > 0 ? "is-due" : undefined}>
                  {earliestNext ? formatDate(earliestNext) : "—"}
                  <small>{totalDue > 0 ? `${formatRwf(totalDue)} due now in total` : "Nothing due yet"}</small>
                </dd>
              </div>
              <div className="mp-figure">
                <dt>Member since</dt>
                <dd>
                  {oldestPayment ? formatDate(oldestPayment.paymentDate) : "—"}
                  <small>{`${plural(payments.length, "payment")} on record`}</small>
                </dd>
              </div>
            </dl>
            ) : (
            <dl className="mp-figures">
              <div className="mp-figure">
                <dt>Plan</dt>
                <dd>
                  {currentPackage?.name ?? lead?.interest ?? "Not set"}
                  {planAmount > 0 ? <small>{formatRwf(planAmount)}{planCadence}</small> : null}
                </dd>
              </div>
              <div className="mp-figure">
                <dt>Next payment</dt>
                <dd className={paymentDue ? "is-due" : undefined}>
                  {membership ? formatDate(membership.nextPaymentDate) : "—"}
                  <small>
                    {membership
                      ? membership.dueAmount > 0
                        ? `${formatRwf(membership.dueAmount)} due now`
                        : "Nothing due yet"
                      : "Nothing scheduled"}
                  </small>
                </dd>
              </div>
              <div className="mp-figure">
                <dt>Member since</dt>
                <dd>
                  {oldestPayment ? formatDate(oldestPayment.paymentDate) : "—"}
                  <small>
                    {payments.length > 0
                      ? `${plural(payments.length, "payment")} on record`
                      : "No payments yet"}
                  </small>
                </dd>
              </div>
            </dl>
            )}
          </section>

          {multiple ? (
            <section className="mp-section" aria-label="Your subscriptions">
              <div className="mp-section-head">
                <h2>Your subscriptions</h2>
                <p className="mp-section-note">Each one renews on its own date</p>
              </div>
              {user.phone ? (
                <SubscriptionList subscriptions={subscriptionItems} momoAvailable={momoAvailable} />
              ) : (
                <SubscriptionList
                  subscriptions={subscriptionItems.map((item) => ({ ...item, packageSlug: null }))}
                />
              )}
            </section>
          ) : null}

          <section className="mp-section">
            <div className="mp-section-head">
              <h2>{multiple ? "Add another package" : paymentDue ? "Renew your membership" : "Pay for a package"}</h2>
              <p className="mp-section-note">MTN MoMo or card, paid securely</p>
            </div>

            {!multiple && paymentDue && membership ? (
              <div className="mp-due">
                <p>
                  <strong>{formatRwf(membership.dueAmount)}</strong> is due
                  {membership.status === "Delayed Payment"
                    ? ` — ${plural(membership.daysUntilSuspension, "day")} left before suspension.`
                    : " to reactivate your membership."}{" "}
                  Your details are already on file, so this takes one tap.
                </p>
              </div>
            ) : null}

            {user.phone ? (
              <PackagePicker
                packages={packages}
                currentSlug={currentSlug}
                currentSubscriptionId={single?.id ?? null}
                momoAvailable={momoAvailable}
              />
            ) : (
              <div className="mp-due">
                <p>
                  Add your phone number before paying online — MoMo sends the payment prompt to
                  it, and Pesapal uses it to reach your mobile money account.
                </p>
                <a className="button primary" href="/membership/profile">
                  Add your phone number
                </a>
              </div>
            )}
          </section>

          <section className="mp-section">
            <div className="mp-section-head">
              <h2>Payment history</h2>
              {payments.length > 0 ? <p className="mp-section-note">Most recent first</p> : null}
            </div>
            {payments.length > 0 ? (
              <div className="mp-table-scroll">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Package</th>
                      {multiple ? <th>Subscription</th> : null}
                      <th>Method</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="mp-date">{formatDate(payment.paymentDate)}</td>
                        <td>{payment.packageName ?? "—"}</td>
                        {multiple ? <td>{payment.subscriptionLabel ?? "—"}</td> : null}
                        <td>
                          <span className="mp-method">{payment.paymentMethod}</span>
                        </td>
                        <td className="num">{formatRwf(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mp-empty">
                No payments recorded yet. Payments made at the front desk or online will appear here.
              </p>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
