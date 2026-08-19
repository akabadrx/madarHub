import Link from "next/link";
import { AlertTriangle, Banknote, CalendarCheck2, MessageCircle, Plus, Search, UserRoundCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ACTIVE_MEMBER_STATUSES } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { getMembershipPaymentStatus } from "@/lib/membership";
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
  const [activeMembers, monthlyPayments] = await db.$transaction([
    db.lead.findMany({
      where: {
        status: { in: [...ACTIVE_MEMBER_STATUSES] },
      },
      include: {
        suggestedPackage: true,
        payments: {
          include: { package: true },
          orderBy: { paymentDate: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.payment.groupBy({
      by: ["leadId"],
      orderBy: { leadId: "asc" },
      where: {
        paymentDate: { gte: monthStart, lte: now },
        lead: { status: { in: [...ACTIVE_MEMBER_STATUSES] } },
      },
      _sum: { amount: true },
    }),
  ]);
  const normalizedQuery = q?.toLocaleLowerCase();
  const members = normalizedQuery
    ? activeMembers.filter((member) => {
        const latestPackage = member.payments[0]?.package || member.suggestedPackage;
        return [member.name, member.phone, member.interest, latestPackage?.name]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery));
      })
    : activeMembers;

  const monthlyRevenueByMember = new Map(
    monthlyPayments.map((payment) => [payment.leadId, payment._sum?.amount || 0]),
  );
  const renewedThisMonth = monthlyPayments.length;
  const monthlyPlans = activeMembers.filter((member) => {
    const pkg = member.payments[0]?.package || member.suggestedPackage;
    return pkg?.billingType === "monthly";
  }).length;
  const monthlyRevenue = monthlyPayments.reduce(
    (sum, payment) => sum + (payment._sum?.amount || 0),
    0,
  );
  const needsPayment = activeMembers.filter((member) => {
    const pkg = member.payments[0]?.package || member.suggestedPackage;
    const info = getMembershipPaymentStatus(pkg, member.payments[0]?.paymentDate, member.payments[0]?.amount, now);
    return info?.status === "Delayed Payment" || info?.status === "Suspended";
  }).length;
  const metrics = [
    ["Active now", activeMembers.length, UserRoundCheck, "text-emerald-700 bg-emerald-50"],
    ["Monthly plans", monthlyPlans, Users, "text-blue-700 bg-blue-50"],
    ["Renewed this month", renewedThisMonth, CalendarCheck2, "text-violet-700 bg-violet-50"],
    ["Monthly revenue", formatRwf(monthlyRevenue), Banknote, "text-amber-700 bg-amber-50"],
    ["Needs payment", needsPayment, AlertTriangle, "text-rose-700 bg-rose-50"],
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Active Members"
        description="Keep current monthly and team members visible, with their plan and latest payment in one place."
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
              <tr><th>Member</th><th>Plan</th><th>Status</th><th>Last payment</th><th>Next payment</th><th>Payment status</th><th>This month</th><th>Total paid</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const latestPayment = member.payments[0];
                const memberPackage = latestPayment?.package || member.suggestedPackage;
                const membershipInfo = getMembershipPaymentStatus(memberPackage, latestPayment?.paymentDate, latestPayment?.amount, now);
                return (
                  <tr key={member.id}>
                    <td>
                      <Link href={`/leads/${member.id}`} className="font-semibold text-[#0b1f3a] hover:underline">
                        {leadDisplayName(member.name, member.phone)}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">{member.phone}</p>
                    </td>
                    <td>{memberPackage?.name || member.interest || "Not set"}</td>
                    <td><StatusBadge status={member.status} /></td>
                    <td>{formatDate(latestPayment?.paymentDate)}</td>
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
                    <td className="font-semibold text-emerald-700">{formatRwf(monthlyRevenueByMember.get(member.id) || 0)}</td>
                    <td className="font-semibold">{formatRwf(member.amountPaid)}</td>
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
        {members.length === 0 && (
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
