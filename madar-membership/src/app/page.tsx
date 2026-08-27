import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { logout } from "@/app/auth-actions";
import { getSessionUser } from "@/lib/session";
import { getCurrentPackage, getLead, getPayments } from "@/lib/crm";
import { getMembershipPaymentStatus } from "@/lib/membership";
import { formatDate, formatRwf } from "@/lib/utils";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "My membership" };

export const dynamic = "force-dynamic";

const BADGE_CLASS: Record<string, string> = {
  Active: "active",
  "Delayed Payment": "delayed",
  Suspended: "suspended",
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // An account with no linked CRM record belongs to someone who signed up
  // before they became a member. They get the portal, just nothing to show yet.
  const lead = user.leadId ? await getLead(user.leadId) : null;
  const [payments, currentPackage] = lead
    ? await Promise.all([getPayments(lead.id), getCurrentPackage(lead.id)])
    : [[], null];

  const lastPayment = payments[0] ?? null;
  const membership = lead
    ? getMembershipPaymentStatus(
        currentPackage,
        lastPayment?.paymentDate ?? null,
        lastPayment?.amount ?? 0,
      )
    : null;

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
                        : "Your membership is suspended. Make a payment to reactivate it."}
                  </p>
                </>
              ) : (
                <>
                  <span className="mp-badge none">No active plan</span>
                  <p className="mp-stat-sub">
                    {lead
                      ? "You have no monthly subscription running right now."
                      : "We have not matched this account to a membership yet. If you already use Madar Hub, message us on WhatsApp and we will connect it."}
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
                <a href={siteUrl("pricing.html")}>View all packages and pricing &rarr;</a>
              </p>
            </section>
          </div>

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
                No payments recorded yet. Payments made at the front desk or through Pesapal will
                appear here.
              </p>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
