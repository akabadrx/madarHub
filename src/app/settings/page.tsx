import { Building2, Database, MapPin, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Settings" };
export default function SettingsPage() {
  const items = [["Business", "Madar Hub", Building2], ["Location", "KG 42 Street, Kigali", MapPin], ["Payment code", "*182*8*00743#", Smartphone], ["Database", "PostgreSQL via Prisma", Database]] as const;
  return <><PageHeader eyebrow="Workspace" title="Settings" description="Core CRM configuration. Authentication and staff roles can be added after the MVP workflow is validated." /><div className="card max-w-3xl divide-y divide-slate-100">{items.map(([label, value, Icon]) => <div className="flex items-center gap-4 p-5" key={label}><div className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><Icon size={19} /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-semibold text-[#0b1f3a]">{value}</p></div></div>)}</div></>;
}
