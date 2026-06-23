import { notFound } from "next/navigation";
import { LeadForm } from "@/components/lead-form";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/lib/db";
import { leadDisplayName } from "@/lib/utils";

export const metadata = { title: "Edit Lead" };
export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const db = getDb();
  const [lead, packages] = await Promise.all([db.lead.findUnique({ where: { id } }), db.package.findMany({ where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true } })]);
  if (!lead) notFound();
  return <div className="mx-auto max-w-4xl"><PageHeader eyebrow="Lead profile" title={`Edit ${leadDisplayName(lead.name, lead.phone)}`} description="Status is highlighted for quick updates during a conversation." /><LeadForm packages={packages} initial={lead} /></div>;
}
