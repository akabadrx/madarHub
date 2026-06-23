import Link from "next/link";
import { ArrowRight, Banknote, CalendarCheck2, Clock3, Flame, Sparkles, TrendingUp, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getDb } from "@/lib/db";
import { formatDate, formatRwf, leadDisplayName } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

function startOfDay(date = new Date()) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function endOfDay(date = new Date()) { const value = new Date(date); value.setHours(23, 59, 59, 999); return value; }

export default async function DashboardPage() {
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [total, newLeads, hot, visits, paid, followUps, revenue, packageGroups, recent] = await db.$transaction([
    db.lead.count(), db.lead.count({ where: { status: "New Lead" } }), db.lead.count({ where: { status: "Hot Lead" } }),
    db.lead.count({ where: { status: "Visit Scheduled" } }), db.lead.count({ where: { paymentStatus: "Paid" } }),
    db.lead.count({ where: { followUpDate: { gte: startOfDay(), lte: endOfDay() } } }),
    db.payment.aggregate({ where: { paymentDate: { gte: monthStart } }, _sum: { amount: true } }),
    db.payment.groupBy({ by: ["packageId"], where: { paymentDate: { gte: monthStart } }, orderBy: { packageId: "asc" }, _sum: { amount: true }, _count: true }),
    db.lead.findMany({ take: 6, orderBy: { updatedAt: "desc" }, include: { suggestedPackage: true } }),
  ]);
  const packageIds = packageGroups.map((group) => group.packageId).filter(Boolean) as string[];
  const packages = await db.package.findMany({ where: { id: { in: packageIds } } });
  const packageMap = new Map(packages.map((pkg) => [pkg.id, pkg.name]));
  const metrics = [
    ["Total leads", total, Users, "text-blue-700 bg-blue-50"], ["New leads", newLeads, UserPlus, "text-violet-700 bg-violet-50"],
    ["Hot leads", hot, Flame, "text-orange-700 bg-orange-50"], ["Visit scheduled", visits, CalendarCheck2, "text-cyan-700 bg-cyan-50"],
    ["Paid customers", paid, Banknote, "text-emerald-700 bg-emerald-50"], ["Follow-up today", followUps, Clock3, "text-amber-700 bg-amber-50"],
  ] as const;

  return <>
    <PageHeader eyebrow="Sales overview" title="Good morning, Madar Hub" description="Keep WhatsApp leads moving from first message to paid member." action={<div className="flex flex-wrap gap-2"><Link href="/lead-assistant" className="btn btn-outline"><Sparkles size={17} />AI Lead Assistant</Link><Link href="/leads/new" className="btn btn-gold"><UserPlus size={17} />Add lead</Link></div>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value, Icon, style]) => <div className="card p-5" key={label}><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-[#0b1f3a]">{value}</p></div><div className={`rounded-xl p-2.5 ${style}`}><Icon size={20} /></div></div></div>)}</section>
    <section className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><p className="text-sm text-slate-500">Monthly revenue</p><h2 className="mt-1 text-3xl font-bold text-[#0b1f3a]">{formatRwf(revenue._sum.amount || 0)}</h2></div><div className="rounded-xl bg-[#fff5d8] p-3 text-[#9a7110]"><TrendingUp /></div></div>
        <div className="p-5"><h3 className="mb-4 text-sm font-bold text-slate-700">Revenue by package</h3>{packageGroups.length ? <div className="space-y-4">{packageGroups.map((group) => { const amount = group._sum?.amount || 0; const pct = revenue._sum.amount ? Math.max(5, amount / revenue._sum.amount * 100) : 0; return <div key={group.packageId || "none"}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="truncate text-slate-600">{group.packageId ? packageMap.get(group.packageId) : "Unassigned"}</span><span className="font-semibold">{formatRwf(amount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#d4a72c]" style={{ width: `${pct}%` }} /></div></div>; })}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No payments recorded this month yet.</p>}</div>
      </div>
      <div className="card overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-5"><h2 className="font-bold text-[#0b1f3a]">Recently updated</h2><Link href="/leads" className="text-sm font-semibold text-[#9a7110]">View all</Link></div><div className="divide-y divide-slate-100">{recent.map((lead) => <Link href={`/leads/${lead.id}`} key={lead.id} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"><div className="min-w-0"><p className="truncate text-sm font-semibold">{leadDisplayName(lead.name, lead.phone)}</p><p className="mt-1 truncate text-xs text-slate-500">{lead.suggestedPackage?.name || lead.interest || "Interest not set"} · {formatDate(lead.updatedAt)}</p></div><div className="flex items-center gap-2"><StatusBadge status={lead.status} /><ArrowRight className="hidden text-slate-400 sm:block" size={16} /></div></Link>)}</div></div>
    </section>
  </>;
}
