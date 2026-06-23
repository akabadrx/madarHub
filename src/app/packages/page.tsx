import { Package as PackageIcon } from "lucide-react";
import { updatePackage } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/lib/db";
import { formatRwf } from "@/lib/utils";

export const metadata = { title: "Packages" };
export default async function PackagesPage() {
  const packages = await getDb().package.findMany({ orderBy: { price: "asc" } });
  return <><PageHeader eyebrow="Pricing" title="Packages" description="Update names and prices here. New payments and package selectors use these values." />
    <div className="grid gap-4 lg:grid-cols-2">{packages.map((pkg) => <form action={updatePackage} className="card p-5" key={pkg.id}><input type="hidden" name="id" value={pkg.id} /><div className="mb-5 flex items-center justify-between"><div className="rounded-xl bg-[#fff5d8] p-2.5 text-[#9a7110]"><PackageIcon size={20} /></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{pkg.active ? "Active" : "Inactive"}</span></div><div className="space-y-4"><div><label className="label">Package name</label><input className="field font-semibold" name="name" defaultValue={pkg.name} /></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Price (RWF)</label><input className="field" type="number" name="price" defaultValue={pkg.price} /></div><div><label className="label">Billing type</label><select className="field" name="billingType" defaultValue={pkg.billingType}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="one-time">One-time</option><option value="hourly">Hourly</option></select></div></div><div><label className="label">Description</label><textarea className="field min-h-20" name="description" defaultValue={pkg.description || ""} /></div></div><div className="mt-5 flex items-center justify-between"><span className="text-sm font-bold text-[#0b1f3a]">{formatRwf(pkg.price)}</span><button className="btn btn-primary">Save package</button></div></form>)}</div>
  </>;
}
