import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PackagePicker } from "@/components/package-picker";
import { logout } from "@/app/auth-actions";
import { linkAccountToLead } from "@/app/checkout-actions";
import { getSessionUser } from "@/lib/session";
import { getActivePackages, getCurrentPackage, getLead, getPayments } from "@/lib/crm";
import { getMembershipPaymentStatus } from "@/lib/membership";
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

  const [payments, currentPackage, packages] = await Promise.all([
    lead ? getPayments(lead.id) : Promise.resolve([]),
    lead ? getCurrentPackage(lead.id) : Promise.resolve(null),
    getActivePackages(),
  ]);

  const lastPayment = payments[0] ?? null;
  const membership = lead
    ? getMembershipPaymentStatus(currentPackage, lastPayment?.paymentDate ?? null, lastPayment?.amount ?? 0)
    : null;

  const currentSlug = packages.find((p) => p.name === currentPackage?.name)?.slug ?? null;
  const paymentDue = membership?.status === "Delayed Payment" || membership?.status === "Suspended";
  const firstName = user.fullName.split(" ")[0] || "there";
  const status = membership?.status ?? "No active plan";
  const monthlyAmount = currentPackage?.price ?? lastPayment?.amount ?? 0;
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
                  {membership
                    ? membership.status === "Active"
                      ? "Your membership is up to date."
                      : membership.status === "Delayed Payment"
                        ? `Payment overdue — ${plural(membership.daysUntilSuspension, "day")} before suspension.`
                        : "Suspended. Renew below to reactivate."
                    : lead
                      ? "No monthly subscription running right now."
                      : "Not connected to a membership yet."}
                </p>
              </div>
              <span className={`mp-chip ${CHIP_CLASS[status] ?? "none"}`}>{status}</span>
            </div>

            <dl className="mp-figures">
              <div className="mp-figure">
                <dt>Plan</dt>
                <dd>
                  {currentPackage?.name ?? lead?.interest ?? "Not set"}
                  {monthlyAmount > 0 ? <small>{formatRwf(monthlyAmount)} per month</small> : null}
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
          </section>

          <section className="mp-section">
            <div className="mp-section-head">
              <h2>{paymentDue ? "Renew your membership" : "Pay for a package"}</h2>
              <p className="mp-section-note">Secure payment through Pesapal</p>
            </div>

            {paymentDue && membership ? (
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
              <PackagePicker packages={packages} currentSlug={currentSlug} />
            ) : (
              <div className="mp-due">
                <p>
                  Add your phone number before paying online — Pesapal uses it to reach your mobile
                  money account.
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
                      <th>Method</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="mp-date">{formatDate(payment.paymentDate)}</td>
                        <td>{payment.packageName ?? "—"}</td>
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
