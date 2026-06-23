import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { CompleteFollowUpButton } from "@/components/complete-follow-up-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getDb } from "@/lib/db";
import { formatDate, leadDisplayName, whatsappUrl } from "@/lib/utils";

export const metadata = { title: "Follow-ups" };

function dayStart(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function dayEnd(date = new Date()) { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; }

export default async function FollowUpsPage() {
  const db = getDb(); const start = dayStart(); const end = dayEnd();
  const [overdue, today, upcoming] = await Promise.all([
    db.lead.findMany({ where: { followUpDate: { lt: start } }, include: { suggestedPackage: true }, orderBy: { followUpDate: "asc" } }),
    db.lead.findMany({ where: { followUpDate: { gte: start, lte: end } }, include: { suggestedPackage: true }, orderBy: { followUpDate: "asc" } }),
    db.lead.findMany({ where: { followUpDate: { gt: end } }, include: { suggestedPackage: true }, orderBy: { followUpDate: "asc" }, take: 50 }),
  ]);
  const sections = [["Overdue", overdue, "text-red-700 bg-red-50"], ["Due today", today, "text-amber-800 bg-amber-50"], ["Upcoming", upcoming, "text-blue-700 bg-blue-50"]] as const;
  return <><PageHeader eyebrow="Daily queue" title="Follow-ups" description="Work overdue conversations first, then clear today's queue. Marking a follow-up done removes its reminder." />
    <div className="space-y-5">{sections.map(([title, leads, style]) => <section className="card overflow-hidden" key={title}><div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-5"><h2 className="font-bold text-[#0b1f3a]">{title}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{leads.length}</span></div><div className="table-wrap"><table className="data-table mobile-card-table"><thead><tr><th>Lead</th><th>Status</th><th>Follow-up</th><th>Package</th><th>Actions</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><Link className="font-semibold hover:underline" href={`/leads/${lead.id}`}>{leadDisplayName(lead.name, lead.phone)}</Link><p className="mt-1 text-xs text-slate-500">{lead.phone}</p></td><td><StatusBadge status={lead.status} /></td><td className={title === "Overdue" ? "font-semibold text-red-600" : ""}>{formatDate(lead.followUpDate, true)}</td><td>{lead.suggestedPackage?.name || lead.interest || "Not set"}</td><td><div className="flex flex-wrap gap-2"><a className="btn bg-[#168b5b] text-white" target="_blank" rel="noreferrer" href={whatsappUrl(lead.phone)}><MessageCircle size={16} />WhatsApp</a><CompleteFollowUpButton leadId={lead.id} /></div></td></tr>)}</tbody></table></div>{leads.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No follow-ups in this group.</p>}</section>)}</div>
  </>;
}
