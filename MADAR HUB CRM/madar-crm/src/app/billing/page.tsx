import Link from "next/link";
import { BadgePercent } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { describeBilling, LOYALTY } from "@/lib/billing";
import { getDb } from "@/lib/db";
import { subscriptionName } from "@/lib/subscriptions";
import { formatDate, formatRwf, leadDisplayName } from "@/lib/utils";

export const metadata = { title: "Loyalty & Custom Prices" };
export const dynamic = "force-dynamic";

/**
 * Everyone on the Loyalty Rate or a custom price, with how far into their
 * commitment they are and what they would owe if they cancelled today, plus
 * every terminated subscription that still owes a penalty. Changes are made
 * in the Billing section of each member's record.
 */
export default async function BillingPage() {
  const subs = await getDb().subscription.findMany({
    where: { OR: [{ priceOverride: { isNot: null } }, { penaltyAmount: { gt: 0 } }] },
    include: {
      lead: { select: { id: true, name: true, phone: true } },
      package: true,
      priceOverride: true,
      termsAcceptances: { select: { termsVersion: true } },
      payments: { orderBy: { paymentDate: "desc" }, select: { paymentDate: true, amount: true, packageId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const rows = subs.map((sub) => ({ sub, billing: describeBilling(sub, sub.payments, sub.termsAcceptances.map((a) => a.termsVersion)) }));

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Loyalty & Custom Prices"
        description={`Members on the Loyalty Rate (${formatRwf(LOYALTY.monthlyTotal)}/month) or another custom price. Open a member to change their price or mark them terminated.`}
      />
      <section className="card overflow-hidden">
        <div className="table-wrap">
          <table className="data-table mobile-card-table">
            <thead>
              <tr><th>Member</th><th>Rate</th><th>Commitment</th><th>Payment status</th><th>Penalty if cancelled today</th><th>Termination</th></tr>
            </thead>
            <tbody>
              {rows.map(({ sub, billing }) => {
                const o = billing.override;
                const active = sub.status === "active";
                return (
                  <tr key={sub.id}>
                    <td>
                      <Link href={`/leads/${sub.lead.id}`} className="font-semibold text-[#0b1f3a] hover:underline">{leadDisplayName(sub.lead.name, sub.lead.phone)}</Link>
                      <p className="mt-1 text-xs text-slate-500">{subscriptionName(sub)}</p>
                    </td>
                    <td>
                      {o ? (
                        <>
                          <span className="font-semibold">{formatRwf(o.monthlyTotal)}</span>
                          <p className="mt-1 text-xs text-slate-500">{o.kind === "loyalty" ? "Loyalty Rate" : "Custom price"}{billing.standardTotal !== null ? ` · standard ${formatRwf(billing.standardTotal)}` : ""}</p>
                        </>
                      ) : "—"}
                    </td>
                    <td>
                      {o?.commitmentMonths ? (
                        o.monthsPaid > 0 ? (
                          <>
                            Month {Math.min(o.monthsPaid, o.commitmentMonths)} of {o.commitmentMonths}
                            <p className="mt-1 text-xs text-slate-500">Ends {formatDate(o.endDate)}{o.termsAccepted ? "" : " · terms not accepted"}</p>
                          </>
                        ) : (
                          <span className="text-slate-500">Not started{o.termsAccepted ? "" : " · terms not accepted"}</span>
                        )
                      ) : "None"}
                    </td>
                    <td>
                      {active && billing.info ? (
                        <>
                          <StatusBadge status={billing.info.status} />
                          {billing.info.status === "Suspended" && o?.commitmentMonths && !o.complete ? (
                            <p className="mt-1 text-xs font-semibold text-rose-600">Past grace: terminate?</p>
                          ) : null}
                        </>
                      ) : active ? "No payment yet" : "Cancelled"}
                    </td>
                    <td className="font-semibold">{active && o ? formatRwf(o.penaltyIfCancelledToday) : "—"}</td>
                    <td>
                      {sub.terminatedAt ? (
                        <>
                          {formatDate(sub.terminatedAt)}
                          {sub.penaltyAmount ? (
                            <p className={`mt-1 text-xs font-semibold ${sub.penaltyPaidAt ? "text-emerald-700" : "text-rose-600"}`}>
                              {formatRwf(sub.penaltyAmount)} {sub.penaltyPaidAt ? "paid" : "owed"}
                            </p>
                          ) : null}
                        </>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="p-10 text-center">
            <BadgePercent className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="font-semibold text-[#0b1f3a]">No custom prices yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Set one from the Billing section of a member&apos;s record.</p>
          </div>
        )}
      </section>
    </>
  );
}
