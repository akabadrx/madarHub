import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, CalendarDays, CreditCard, Edit3, Mail, MapPin, MessageCircle, Phone, Sparkles, Tag } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { NoteForm } from "@/components/note-form";
import { PageHeader } from "@/components/page-header";
import { PaymentForm } from "@/components/payment-form";
import { QuickStatus } from "@/components/quick-status";
import { StatusBadge } from "@/components/status-badge";
import { VisitForm } from "@/components/visit-form";
import { ConversationReply } from "@/components/conversation-reply";
import { getDb } from "@/lib/db";
import { formatDate, formatRwf, leadDisplayName, whatsappUrl } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const lead = await getDb().lead.findUnique({ where: { id }, select: { name: true, phone: true } }); return { title: lead ? leadDisplayName(lead.name, lead.phone) : "Lead" }; }

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const db = getDb();
  const [lead, packages, templates] = await Promise.all([
    db.lead.findUnique({ where: { id }, include: { suggestedPackage: true, payments: { include: { package: true }, orderBy: { paymentDate: "desc" } }, visits: { orderBy: { visitDate: "desc" } }, interactions: { orderBy: { createdAt: "desc" } } } }),
    db.package.findMany({ where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true } }),
    db.messageTemplate.findMany({ orderBy: { title: "asc" } }),
  ]);
  if (!lead) notFound();
  const name = leadDisplayName(lead.name, lead.phone);
  const option = [{ id: lead.id, name }];
  const aiBadge = lead.aiConfidence != null ? Math.round(lead.aiConfidence * 100) : null;
  return <>
    <PageHeader eyebrow="Lead profile" title={name} description={`${lead.source} · Created ${formatDate(lead.createdAt)}`} action={<div className="flex flex-wrap gap-2"><a href={whatsappUrl(lead.phone)} target="_blank" rel="noreferrer" className="btn bg-[#168b5b] text-white"><MessageCircle size={17} />WhatsApp</a><Link href="/lead-assistant" className="btn btn-outline"><Bot size={16} />AI Lead Assistant</Link><Link href={`/leads/${lead.id}/edit`} className="btn btn-outline"><Edit3 size={16} />Edit</Link></div>} />
    {lead.aiSummary && <div className="card flex items-start gap-4 border-[#eadcae] bg-[#fffaf0] p-5"><div className="rounded-xl bg-[#fff5d8] p-2.5 text-[#9a7110]"><Sparkles size={20} /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-[#9a7110]">AI Summary</p><p className="mt-1 text-sm leading-6 text-slate-700">{lead.aiSummary}</p></div>{aiBadge != null && <span className="shrink-0 rounded-full bg-[#0b1f3a] px-2.5 py-1 text-xs font-semibold text-white">{aiBadge}%</span>}</div>}
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <section className="card p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-[#0b1f3a]">Lead overview</h2><QuickStatus leadId={lead.id} status={lead.status} /></div><div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4"><Phone className="mb-2 text-[#9a7110]" size={18} /><p className="text-xs text-slate-500">Phone</p><p className="mt-1 font-semibold">{lead.phone}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><Tag className="mb-2 text-[#9a7110]" size={18} /><p className="text-xs text-slate-500">Interest</p><p className="mt-1 font-semibold">{lead.interest || "Not set"}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><CreditCard className="mb-2 text-[#9a7110]" size={18} /><p className="text-xs text-slate-500">Suggested package</p><p className="mt-1 font-semibold">{lead.suggestedPackage?.name || "Not set"}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><CalendarDays className="mb-2 text-[#9a7110]" size={18} /><p className="text-xs text-slate-500">Next visit</p><p className="mt-1 font-semibold">{formatDate(lead.visitDate, true)}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><Mail className="mb-2 text-[#9a7110]" size={18} /><p className="text-xs text-slate-500">Follow-up</p><p className="mt-1 font-semibold">{formatDate(lead.followUpDate, true)}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><MapPin className="mb-2 text-[#9a7110]" size={18} /><p className="text-xs text-slate-500">Paid to date</p><p className="mt-1 font-semibold">{formatRwf(lead.amountPaid)}</p></div>
        </div>{lead.notes && <div className="mt-4 rounded-xl border border-[#eadcae] bg-[#fffaf0] p-4 text-sm leading-6"><strong className="block text-[#76570b]">Lead notes</strong>{lead.notes}</div>}</section>
        <section className="card p-5"><h2 className="mb-4 font-bold text-[#0b1f3a]">Timeline and notes</h2><NoteForm leadId={lead.id} /><div className="mt-5 space-y-3">{lead.interactions.map((item) => <div className="flex gap-3" key={item.id}><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#d4a72c]" /><div><p className="text-sm text-slate-700">{item.content}</p><p className="mt-1 text-xs text-slate-400">{item.type} · {formatDate(item.createdAt, true)}</p></div></div>)}{lead.interactions.length === 0 && <p className="text-sm text-slate-500">No interactions recorded yet.</p>}</div>{lead.rawWhatsappSnippet && <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600">WhatsApp chat snippet</summary><div className="mt-2 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500 whitespace-pre-line">{lead.rawWhatsappSnippet}</div></details>}</section>
        <section className="card p-5"><h2 className="mb-4 font-bold text-[#0b1f3a]">Visit history</h2><VisitForm leads={option} defaultLeadId={lead.id} /><div className="mt-5 table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Status</th><th>Notes</th></tr></thead><tbody>{lead.visits.map((visit) => <tr key={visit.id}><td>{formatDate(visit.visitDate, true)}</td><td><StatusBadge status={visit.status} /></td><td>{visit.notes || "—"}</td></tr>)}</tbody></table></div></section>
        <section className="card p-5"><h2 className="mb-4 font-bold text-[#0b1f3a]">Payment history</h2><PaymentForm leads={option} packages={packages} defaultLeadId={lead.id} /><div className="mt-5 table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Package</th><th>Method</th><th>Amount</th></tr></thead><tbody>{lead.payments.map((payment) => <tr key={payment.id}><td>{formatDate(payment.paymentDate)}</td><td>{payment.package?.name || "Unassigned"}</td><td>{payment.paymentMethod}</td><td className="font-semibold">{formatRwf(payment.amount)}</td></tr>)}</tbody></table></div></section>
      </div>
      <aside className="space-y-4"><section className="card p-5"><h2 className="font-bold text-[#0b1f3a]">Current stage</h2><div className="mt-3"><StatusBadge status={lead.status} /></div><p className="mt-3 text-sm leading-6 text-slate-500">Last updated {formatDate(lead.updatedAt, true)}.</p></section>
        <ConversationReply leadId={lead.id} leadPhone={lead.phone} leadName={lead.name} />
        <section className="card p-5"><h2 className="mb-1 font-bold text-[#0b1f3a]">Quick messages</h2><p className="mb-4 text-sm text-slate-500">The lead name is inserted automatically.</p><div className="space-y-3">{templates.map((template) => { const message = template.body.replaceAll("{{name}}", lead.name ? `${lead.name},` : "there,"); return <div className="rounded-xl border border-slate-200 p-3" key={template.id}><p className="mb-2 text-sm font-semibold">{template.title}</p><p className="line-clamp-3 whitespace-pre-line text-xs leading-5 text-slate-500">{message}</p><div className="mt-3 flex flex-wrap gap-2"><CopyButton text={message} /><a className="btn btn-outline" href={whatsappUrl(lead.phone, message)} target="_blank" rel="noreferrer"><MessageCircle size={15} />Open</a></div></div>; })}</div></section>
      </aside>
    </div>
  </>;
}
