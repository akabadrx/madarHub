import { LeadForm } from "@/components/lead-form";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/lib/db";

export const metadata = { title: "Add Lead" };
export default async function NewLeadPage() {
  const packages = await getDb().package.findMany({ where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true } });
  return <div className="mx-auto max-w-4xl"><PageHeader eyebrow="New opportunity" title="Add a lead" description="Capture the WhatsApp conversation now. You can add payments, visits, and notes from the lead profile." /><LeadForm packages={packages} /></div>;
}
