import Link from "next/link";
import { Banknote, CreditCard, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PaymentForm } from "@/components/payment-form";
import { getDb } from "@/lib/db";
import { formatDate, formatRwf, leadDisplayName } from "@/lib/utils";

export const metadata = { title: "Payments" };
function startOfDay() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export default async function PaymentsPage() {
  const db = getDb(); const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [payments, leads, packages, today, month, leadCount] = await Promise.all([
    db.payment.findMany({ include: { lead: true, package: true }, orderBy: { paymentDate: "desc" }, take: 100 }),
    db.lead.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    db.package.findMany({ where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true } }),
    db.payment.aggregate({ where: { paymentDate: { gte: startOfDay() } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { paymentDate: { gte: monthStart } }, _sum: { amount: true }, _count: true }), db.lead.count(),
  ]);
  const paidDayPasses = payments.filter((p) => p.package?.name.includes("Day Pass")).length;
  const monthly = payments.filter((p) => p.package?.billingType === "monthly").length;
  const metrics = [["Today", formatRwf(today._sum.amount || 0), Banknote], ["This month", formatRwf(month._sum.amount || 0), TrendingUp], ["Avg. per lead", formatRwf(leadCount ? Math.round((month._sum.amount || 0) / leadCount) : 0), Users], ["Day pass / monthly", `${paidDayPasses} / ${monthly}`, CreditCard]] as const;
  return <><PageHeader eyebrow="Revenue" title="Payments" description="Record MoMo, cash, and bank payments. Package selection updates the lead stage automatically." />
    <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, Icon]) => <div className="card p-5" key={label}><div className="flex justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-[#0b1f3a]">{value}</p></div><Icon className="text-[#d4a72c]" size={21} /></div></div>)}</section>
    <section className="card mb-5 p-5"><h2 className="mb-4 font-bold text-[#0b1f3a]">Record a payment</h2><PaymentForm leads={leads.map((lead) => ({ id: lead.id, name: leadDisplayName(lead.name, lead.phone) }))} packages={packages} /></section>
    <section className="card overflow-hidden"><div className="table-wrap"><table className="data-table mobile-card-table"><thead><tr><th>Date</th><th>Customer</th><th>Package</th><th>Method</th><th>Amount</th><th>Notes</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{formatDate(payment.paymentDate)}</td><td><Link className="font-semibold hover:underline" href={`/leads/${payment.leadId}`}>{leadDisplayName(payment.lead.name, payment.lead.phone)}</Link></td><td>{payment.package?.name || "Unassigned"}</td><td>{payment.paymentMethod}</td><td className="font-semibold">{formatRwf(payment.amount)}</td><td>{payment.notes || "—"}</td></tr>)}</tbody></table></div></section>
  </>;
}
