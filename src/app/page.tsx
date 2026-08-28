import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PackagePicker } from "@/components/package-picker";
import { logout } from "@/app/auth-actions";
import { linkAccountToLeadIfPossible } from "@/app/checkout-actions";
import { getSessionUser } from "@/lib/session";
import { getActivePackages, getCurrentPackage, getLead, getPayments } from "@/lib/crm";
import { getMembershipPaymentStatus } from "@/lib/membership";
import { formatDate, formatRwf } from "@/lib/utils";

export const metadata: Metadata = { title: "My membership" };

export const dynamic = "force-dynamic";

const BADGE_CLASS: Record<string, string> = {
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; package?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // An account can be created before the member exists in the CRM, and a Google
  // sign-up carries no phone at all. Retry the match on each visit so a member
  // is connected as soon as their record or number appears.
  const leadId =
    user.leadId ?? (user.phone ? await linkAccountToLeadIfPossible(user.id, user.phone) : null);

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
            <form action={logout}>
              <button className="mp-logout" type="submit">
                Log out
              </button>
            </form>
          </div>

          {notice ? (
            <p className={`mp-alert ${notice.tone}`} role="status" style={{ marginBottom: 24 }}>
              {notice.text}
            </p>
          ) : null}

          <div className="mp-grid">
            <section className="mp-panel">
              <h2>Membership status</h2>
              {membership ? (
                <>
                  <span className={`mp-badge ${BADGE_CLASS[membership.status] ?? "none"}`}>
                    {membership.status}
                  </span>
                  <p className="mp-stat-sub">
                    {membership.status === "Active"
                      ? "Your membership is up to date."
                      : membership.status === "Delayed Payment"
                        ? `Payment is overdue. ${membership.daysUntilSuspension} day${
                            membership.daysUntilSuspension === 1 ? "" : "s"
                          } left before your desk is suspended.`
                        : "Your membership is suspended. Pay below to reactivate it."}
                  </p>
                </>
              ) : (
                <>
                  <span className="mp-badge none">No active plan</span>
                  <p className="mp-stat-sub">
                    {lead
                      ? "You have no monthly subscription running right now."
                      : "We have not matched this account to a membership yet. Pick a package below to get started."}
                  </p>
                </>
              )}
            </section>

            <section className="mp-panel">
              <h2>Next payment</h2>
              {membership ? (
                <>
                  <p className="mp-stat">{formatDate(membership.nextPaymentDate)}</p>
                  <p className="mp-stat-sub">
                    {membership.dueAmount > 0
                      ? `${formatRwf(membership.dueAmount)} due now`
                      : `${formatRwf(currentPackage?.price ?? lastPayment?.amount ?? 0)} per month`}
                  </p>
                </>
              ) : (
                <>
                  <p className="mp-stat">&mdash;</p>
                  <p className="mp-stat-sub">Nothing scheduled.</p>
                </>
              )}
            </section>

            <section className="mp-panel">
              <h2>Your package</h2>
              <p className="mp-stat">{currentPackage?.name ?? lead?.interest ?? "Not set"}</p>
              <p className="mp-stat-sub">
                {currentPackage
                  ? `${formatRwf(currentPackage.price)} ${currentPackage.billingType}`
                  : "Choose one below to get started."}
              </p>
            </section>
          </div>

          <section className="mp-panel" style={{ marginTop: 20 }}>
            <h2>{paymentDue ? "Renew your membership" : "Pay for a package"}</h2>

            {paymentDue && membership ? (
              <div className="mp-due">
                <p style={{ margin: 0 }}>
                  <strong>{formatRwf(membership.dueAmount)}</strong> is due
                  {membership.status === "Delayed Payment"
                    ? ` — ${membership.daysUntilSuspension} day${
                        membership.daysUntilSuspension === 1 ? "" : "s"
                      } left before suspension.`
                    : " to reactivate your membership."}{" "}
                  Your details are already on file, so this takes one tap.
                </p>
              </div>
            ) : null}

            <PackagePicker
              packages={packages}
              currentSlug={currentSlug}
              renewLabel={paymentDue ? "Renew now" : currentSlug ? "Pay now" : "Continue to payment"}
            />
          </section>

          <section className="mp-panel" style={{ marginTop: 20 }}>
            <h2>Payment history</h2>
            {payments.length > 0 ? (
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
                      <td>{formatDate(payment.paymentDate)}</td>
                      <td>{payment.packageName ?? "—"}</td>
                      <td>{payment.paymentMethod}</td>
                      <td className="num">{formatRwf(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
