import Link from "next/link";
import { AlertTriangle, Banknote, CalendarCheck2, MessageCircle, Plus, Search, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { PortalInviteButton } from "@/components/portal-invite-button";
import { ACTIVE_MEMBER_STATUSES } from "@/lib/constants";
import { getDb } from "@/lib/db";
import type { MembershipPaymentInfo } from "@/lib/membership";
import { netRevenueAmount } from "@/lib/revenue";
import { getSubscriptionPaymentStatus, subscriptionName } from "@/lib/subscriptions";
import { formatDate, formatRwf, leadDisplayName, whatsappUrl } from "@/lib/utils";

export const metadata = { title: "Active Members" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const memberWhere = { status: { in: [...ACTIVE_MEMBER_STATUSES] } };
  const [activeMembers, subscriptions, monthlyPayments, subscriptionTotals] = await db.$transaction([
    db.lead.findMany({
      where: memberWhere,
      include: { suggestedPackage: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.subscription.findMany({
      where: { status: "active", lead: memberWhere },
      include: {
        package: true,
        payments: { orderBy: { paymentDate: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.payment.groupBy({
      by: ["leadId", "subscriptionId", "packageId"],
      orderBy: { leadId: "asc" },
      where: {
        paymentDate: { gte: monthStart, lte: now },
        lead: memberWhere,
      },
      _sum: { amount: true },
    }),
    db.payment.groupBy({
      by: ["subscriptionId"],
      orderBy: { subscriptionId: "asc" },
      where: { subscriptionId: { not: null }, lead: memberWhere },
      _sum: { amount: true },
    }),
  ]);

  // One row per active subscription, so a person holding three shows three
  // times, each with its own plan and due date. A member with none yet still
  // gets a row, so nobody drops off the list while staff set them up.
  type Member = (typeof activeMembers)[number];
  type Row = {
    key: string;
    member: Member;
    subscriptionId: string | null;
    name: string | null;
    plan: string | null;
    lastPaymentDate: Date | null;
    info: MembershipPaymentInfo | null;
  };
  const subscriptionsByLead = new Map<string, typeof subscriptions>();
  subscriptions.forEach((sub) => subscriptionsByLead.set(sub.leadId, [...(subscriptionsByLead.get(sub.leadId) ?? []), sub]));
  const allRows: Row[] = activeMembers.flatMap((member): Row[] => {
    const subs = subscriptionsByLead.get(member.id) ?? [];
    if (subs.length === 0) {
      return [{ key: member.id, member, subscriptionId: null, name: null, plan: member.suggestedPackage?.name || member.interest, lastPaymentDate: null, info: null }];
    }
    return subs.map((sub) => ({
      key: sub.id,
      member,
      subscriptionId: sub.id,
      name: sub.label ? subscriptionName(sub) : null,
      plan: sub.package?.name ?? "Custom amount",
      lastPaymentDate: sub.payments[0]?.paymentDate ?? null,
      info: getSubscriptionPaymentStatus(sub, sub.payments[0], now),
    }));
  });

  const normalizedQuery = q?.toLocaleLowerCase();
  const rows = normalizedQuery
    ? allRows.filter((row) =>
        [row.member.name, row.member.phone, row.member.interest, row.name, row.plan]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : allRows;

  const netMonthly = (key: (payment: (typeof monthlyPayments)[number]) => string | null) => {
    const totals = new Map<string, number>();
    monthlyPayments.forEach((payment) => {
      const id = key(payment);
      if (!id) return;
      totals.set(id, (totals.get(id) || 0) + netRevenueAmount(payment._sum?.amount || 0, payment.packageId));
    });
    return totals;
  };
  const monthlyBySubscription = netMonthly((payment) => payment.subscriptionId);
  const monthlyByMember = netMonthly((payment) => payment.leadId);
  const totalBySubscription = new Map(subscriptionTotals.map((row) => [row.subscriptionId, row._sum?.amount || 0]));
  const renewedThisMonth = new Set(monthlyPayments.flatMap((payment) => (payment.subscriptionId ? [payment.subscriptionId] : []))).size;
  const monthlyRevenue = monthlyPayments.reduce(
    (sum, payment) => sum + netRevenueAmount(payment._sum?.amount || 0, payment.packageId),
    0,
  );
  const needsPayment = allRows.filter((row) => row.info?.status === "Delayed Payment" || row.info?.status === "Suspended").length;
  const metrics = [
    ["Active now", activeMembers.length, UserRoundCheck, "text-emerald-700 bg-emerald-50"],
    ["Subscriptions", subscriptions.length, Users, "text-blue-700 bg-blue-50"],
    ["Renewed this month", renewedThisMonth, CalendarCheck2, "text-violet-700 bg-violet-50"],
    ["Monthly revenue", formatRwf(monthlyRevenue), Banknote, "text-amber-700 bg-amber-50"],
    ["Needs payment", needsPayment, AlertTriangle, "text-rose-700 bg-rose-50"],
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Active Members"
        description="Every active subscription with its plan and latest payment. A member with several subscriptions has one row for each."
        action={
          <Link href="/leads/new" className="btn btn-gold">
            <Plus size={17} />Add member
          </Link>
        }
      />

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, value, Icon, style]) => (
          <div className="card p-5" key={label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-bold tracking-tight text-[#0b1f3a]">{value}</p>
              </div>
              <div className={`rounded-xl p-2.5 ${style}`}><Icon size={20} /></div>
            </div>
          </div>
        ))}
      </section>

      <form className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-3.5 text-slate-400" size={17} />
          <input
            name="q"
            defaultValue={params.q}
            className="field pl-10"
            placeholder="Search members by name, phone, or plan"
          />
        </label>
        <button className="btn btn-primary">Search</button>
        {q && <Link href="/members" className="btn btn-outline">Clear</Link>}
      </form>

      <section className="card overflow-hidden">
        <div className="table-wrap">
          <table className="data-table mobile-card-table">
            <thead>
              <tr><th>Member</th><th>Plan</th><th>Status</th><th>Last payment</th><th>Next payment</th><th>Payment status</th><th>Portal</th><th>This month</th><th>Total paid</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map(({ key, member, subscriptionId, name, plan, lastPaymentDate, info: membershipInfo }) => {
                return (
                  <tr key={key}>
                    <td>
                      <Link href={`/leads/${member.id}`} className="font-semibold text-[#0b1f3a] hover:underline">
                        {leadDisplayName(member.name, member.phone)}
                      </Link>
                      {name && <p className="mt-1 text-xs font-semibold text-[#9a7110]">{name}</p>}
                      <p className="mt-1 text-xs text-slate-500">{member.phone}</p>
                    </td>
                    <td>{subscriptionId ? plan : <span className="text-slate-500">{plan || "No subscription yet"}</span>}</td>
                    <td><StatusBadge status={member.status} /></td>
                    <td>{formatDate(lastPaymentDate)}</td>
                    <td>{membershipInfo ? formatDate(membershipInfo.nextPaymentDate) : "—"}</td>
                    <td>
                      {membershipInfo ? (
                        <div>
                          <StatusBadge status={membershipInfo.status} />
                          {membershipInfo.dueAmount > 0 && (
                            <p className="mt-1 text-xs font-semibold text-rose-600">{formatRwf(membershipInfo.dueAmount)} due</p>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td>
                      {member.portalLinkedAt ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          <ShieldCheck size={13} />On portal
                        </span>
                      ) : (
                        <PortalInviteButton leadId={member.id} linked={false} className="btn btn-outline min-h-9 px-2.5 text-xs" />
                      )}
                    </td>
                    <td className="font-semibold text-emerald-700">{formatRwf((subscriptionId ? monthlyBySubscription.get(subscriptionId) : monthlyByMember.get(member.id)) || 0)}</td>
                    <td className="font-semibold">{formatRwf(subscriptionId ? totalBySubscription.get(subscriptionId) || 0 : member.amountPaid)}</td>
                    <td>
                      <div className="flex gap-2">
                        <a
                          className="btn btn-outline min-h-9 px-2.5"
                          href={whatsappUrl(member.phone)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Message ${leadDisplayName(member.name, member.phone)} on WhatsApp`}
                        >
                          <MessageCircle size={16} />
                        </a>
                        <Link className="btn btn-outline min-h-9" href={`/leads/${member.id}`}>View</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="p-10 text-center">
            <UserRoundCheck className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="font-semibold text-[#0b1f3a]">{q ? "No members match your search" : "No active members yet"}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {q
                ? "Try another name, phone number, or plan."
                : "Members appear here when their lead status is Paid Monthly or Active Member."}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
