import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { VisitForm } from "@/components/visit-form";
import { VisitStatus } from "@/components/visit-status";
import { getDb } from "@/lib/db";
import { formatDate, leadDisplayName } from "@/lib/utils";

export const metadata = { title: "Visits" };
export default async function VisitsPage() {
  const db = getDb();
  const [visits, leads] = await Promise.all([db.visit.findMany({ include: { lead: true }, orderBy: { visitDate: "asc" } }), db.lead.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } })]);
  const leadOptions = leads.map((lead) => ({ id: lead.id, name: leadDisplayName(lead.name, lead.phone) }));
  return <><PageHeader eyebrow="Space tours" title="Visits" description="Schedule tours and track completed, missed, or rescheduled visits." />
    <section className="card mb-5 p-5"><div className="mb-4 flex items-center gap-2"><CalendarDays size={19} className="text-[#9a7110]" /><h2 className="font-bold text-[#0b1f3a]">Schedule a visit</h2></div><VisitForm leads={leadOptions} /></section>
    <section className="card overflow-hidden"><div className="table-wrap"><table className="data-table mobile-card-table"><thead><tr><th>Date and time</th><th>Lead</th><th>Status</th><th>Notes</th></tr></thead><tbody>{visits.map((visit) => <tr key={visit.id}><td className="font-semibold">{formatDate(visit.visitDate, true)}</td><td><Link className="font-semibold hover:underline" href={`/leads/${visit.leadId}`}>{leadDisplayName(visit.lead.name, visit.lead.phone)}</Link><p className="mt-1 text-xs text-slate-500">{visit.lead.phone}</p></td><td><VisitStatus id={visit.id} status={visit.status} /></td><td>{visit.notes || "—"}</td></tr>)}</tbody></table></div>{!visits.length && <p className="p-8 text-center text-sm text-slate-500">No visits scheduled yet.</p>}</section>
  </>;
}
