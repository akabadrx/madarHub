import { AlertTriangle, ShoppingCart, Receipt, Trash2 } from "lucide-react";
import { deletePurchase, setPurchaseCategory } from "@/app/tax-actions";
import { PageHeader } from "@/components/page-header";
import { PurchaseForm } from "@/components/purchase-form";
import { getDb } from "@/lib/db";
import { amount, cents, isInputVatClaimable, PURCHASE_CATEGORIES, quarterPeriod, quarterOf } from "@/lib/tax";
import { formatDate, formatRwf } from "@/lib/utils";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  const now = new Date();
  const quarter = quarterPeriod(now.getUTCFullYear(), quarterOf(now));
  const rows = await getDb().purchase.findMany({ orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }], take: 300 });
  const purchases = rows.map((row) => ({ ...row, totalAmount: amount(row.totalAmount), vatAmount: amount(row.vatAmount) }));
  const thisQuarter = purchases.filter((row) => row.purchaseDate >= quarter.start && row.purchaseDate < quarter.end);
  const claimable = thisQuarter.filter(isInputVatClaimable);
  const missing = thisQuarter.filter((row) => row.vatAmount > 0 && !isInputVatClaimable(row));
  const metrics = [
    [`Spent in ${quarter.label}`, formatRwf(cents(thisQuarter.reduce((sum, row) => sum + row.totalAmount, 0))), ShoppingCart],
    ["Input VAT you can claim", formatRwf(cents(claimable.reduce((sum, row) => sum + row.vatAmount, 0))), Receipt],
    ["VAT receipts missing details", String(missing.length), AlertTriangle],
  ] as const;

  return <>
    <PageHeader eyebrow="Finance" title="Purchases" description="Record what Madar Hub buys. With the supplier's TIN, receipt number and SDC ID, the VAT on it comes off your VAT bill; everything here also counts as an expense for the yearly income tax return." />
    <section className="mb-5 grid gap-4 sm:grid-cols-3">{metrics.map(([label, value, Icon]) => <div className="card p-5" key={label}><div className="flex justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-[#0b1f3a]">{value}</p></div><Icon className="text-[#d4a72c]" size={21} /></div></div>)}</section>
    <section className="card mb-5 p-5"><h2 className="mb-4 font-bold text-[#0b1f3a]">Record a purchase</h2><PurchaseForm /></section>
    <section className="card overflow-hidden"><div className="table-wrap"><table className="data-table mobile-card-table"><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>EBM receipt</th><th>Total</th><th>VAT</th><th>Input VAT</th><th></th></tr></thead><tbody>
      {purchases.map((row) => {
        const ok = isInputVatClaimable(row);
        return <tr key={row.id}>
          <td>{formatDate(row.purchaseDate)}</td>
          <td><span className="font-semibold">{row.supplierName}</span>{row.supplierTin && <p className="mt-0.5 font-mono text-xs text-slate-500">TIN {row.supplierTin}</p>}{row.description && <p className="mt-0.5 text-xs text-slate-500">{row.description}</p>}</td>
          <td><form action={setPurchaseCategory} className="flex items-center gap-1.5"><input type="hidden" name="id" value={row.id} /><select aria-label={`Category for ${row.supplierName}`} name="category" defaultValue={row.category} className="field min-h-8 w-auto py-1 text-xs">{PURCHASE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><button className="btn btn-outline min-h-8 px-2 text-xs">Save</button></form></td>
          <td>{row.receiptNumber || row.sdcId ? <span className="font-mono text-xs">{row.receiptNumber || "—"}<br />{row.sdcId || "—"}</span> : "—"}</td>
          <td className="font-semibold">{formatRwf(row.totalAmount)}</td>
          <td>{formatRwf(row.vatAmount)}</td>
          <td>{row.vatAmount === 0 ? <span className="text-xs text-slate-400">No VAT</span> : ok ? <span className="text-xs font-semibold text-emerald-700">Claimable</span> : <span className="text-xs font-semibold text-amber-700">Needs TIN, receipt no. and SDC ID</span>}</td>
          <td><details><summary className="cursor-pointer list-none text-slate-400 hover:text-rose-700" aria-label={`Delete purchase from ${row.supplierName}`}><Trash2 size={15} /></summary><form action={deletePurchase} className="mt-2"><input type="hidden" name="id" value={row.id} /><button className="btn btn-outline min-h-8 px-2.5 text-xs text-rose-700">Delete</button></form></details></td>
        </tr>;
      })}
      {purchases.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-500">No purchases recorded yet.</td></tr>}
    </tbody></table></div></section>
  </>;
}
