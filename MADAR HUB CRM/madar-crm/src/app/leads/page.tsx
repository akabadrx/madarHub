import Link from "next/link";
import { MessageCircle, Plus, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { QuickStatus } from "@/components/quick-status";
import { DeleteLeadButton } from "@/components/delete-lead-button";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { formatDate, formatRwf, leadDisplayName, whatsappUrl } from "@/lib/utils";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; source?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim();
  const leads = await getDb().lead.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { notes: { contains: q, mode: "insensitive" } }] } : {}),
      ...(params.status ? { status: params.status } : {}), ...(params.source ? { source: params.source } : {}),
    },
    include: { suggestedPackage: true }, orderBy: { updatedAt: "desc" },
  });
  return <>
    <PageHeader eyebrow="Pipeline" title="Leads" description={`${leads.length} leads match the current view. Update status directly while handling WhatsApp conversations.`} action={<div className="flex gap-2"><Link href="/lead-assistant" className="btn btn-outline"><Sparkles size={17} />AI Assistant</Link><Link href="/leads/new" className="btn btn-gold"><Plus size={17} />Add lead</Link></div>} />
    <form className="card mb-4 grid gap-3 p-4 md:grid-cols-[1fr_220px_200px_auto]">
      <label className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={17} /><input name="q" defaultValue={params.q} className="field pl-10" placeholder="Search name, phone, or notes" /></label>
      <select name="status" defaultValue={params.status || ""} className="field"><option value="">All statuses</option>{LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
      <select name="source" defaultValue={params.source || ""} className="field"><option value="">All sources</option>{LEAD_SOURCES.map((source) => <option key={source}>{source}</option>)}</select>
      <button className="btn btn-primary">Filter</button>
    </form>
    <div className="card overflow-hidden"><div className="table-wrap"><table className="data-table mobile-card-table"><thead><tr><th>Lead</th><th>Interest</th><th>Status</th><th>Follow-up</th><th>Paid</th><th>Source</th><th>Actions</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}>
      <td><Link href={`/leads/${lead.id}`} className="font-semibold text-[#0b1f3a] hover:underline">{leadDisplayName(lead.name, lead.phone)}</Link><p className="mt-1 text-xs text-slate-500">{lead.phone}</p></td>
      <td><p className="max-w-48 truncate">{lead.suggestedPackage?.name || lead.interest || "Not set"}</p></td>
      <td><QuickStatus leadId={lead.id} status={lead.status} /></td>
      <td className={lead.followUpDate && lead.followUpDate < new Date() ? "font-semibold text-red-600" : "text-slate-600"}>{formatDate(lead.followUpDate, true)}</td>
      <td>{formatRwf(lead.amountPaid)}</td><td>{lead.source}</td>
      <td><div className="flex gap-2"><a className="btn btn-outline min-h-9 px-2.5" href={whatsappUrl(lead.phone)} target="_blank" rel="noreferrer" aria-label="Open WhatsApp"><MessageCircle size={16} /></a><Link className="btn btn-outline min-h-9" href={`/leads/${lead.id}`}>View</Link><DeleteLeadButton leadId={lead.id} name={leadDisplayName(lead.name, lead.phone)} /></div></td>
    </tr>)}</tbody></table></div>{leads.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No leads found. Adjust the filters or add a new lead.</div>}</div>
  </>;
}
