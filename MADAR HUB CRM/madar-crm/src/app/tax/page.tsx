import Link from "next/link";
import { AlertTriangle, CalendarClock, Download, Landmark, Receipt, ShoppingCart, TrendingUp } from "lucide-react";
import { AnnexImport } from "@/components/annex-import";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/lib/db";
import { CAPITAL_CATEGORY, CIT_RATE_PERCENT, incomeTaxDueDate, periodFromParams, vatDueDate, type TaxPeriod } from "@/lib/tax";
import { loadLedger, type Ledger } from "@/lib/tax-ledger";
import { basePathUrl, formatDate, formatRwf } from "@/lib/utils";

export const metadata = { title: "Tax & Finance" };

function exportHref(kind: "sales" | "purchases", period: TaxPeriod, format: "annex" | "csv") {
  // A plain download link, so the base path is not added for us as <Link> would.
  return basePathUrl(`/api/tax/export?kind=${kind}&year=${period.year}&q=${period.quarter ?? "year"}&format=${format}`);
}

function Downloads({ kind, period }: { kind: "sales" | "purchases"; period: TaxPeriod }) {
  return <div className="flex flex-wrap gap-2"><a className="btn btn-primary" href={exportHref(kind, period, "annex")}><Download size={16} />e-Tax annex (.txt)</a><a className="btn btn-outline" href={exportHref(kind, period, "csv")}><Download size={16} />CSV</a></div>;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function Metric({ label, value, hint, Icon, tone }: { label: string; value: string; hint?: string; Icon: typeof Receipt; tone?: "good" | "bad" }) {
  return <div className="card p-5"><div className="flex justify-between gap-3"><div><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-xl font-bold ${tone === "bad" ? "text-rose-700" : tone === "good" ? "text-emerald-700" : "text-[#0b1f3a]"}`}>{value}</p>{hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div><Icon className="shrink-0 text-[#d4a72c]" size={21} /></div></div>;
}

function Warnings({ ledger }: { ledger: Ledger }) {
  const items = [
    ledger.uninvoicedPayments > 0 && <>{ledger.uninvoicedPayments} payment{ledger.uninvoicedPayments === 1 ? "" : "s"} in this period {ledger.uninvoicedPayments === 1 ? "has" : "have"} no EBM invoice. <Link className="font-semibold underline" href="/invoices">Invoice them</Link> so the sale is declared.</>,
    ledger.drafts > 0 && <>{ledger.drafts} draft invoice{ledger.drafts === 1 ? " is" : "s are"} waiting for an EBM receipt number. <Link className="font-semibold underline" href="/invoices?status=draft">Finish them</Link>.</>,
    ledger.unclaimableVatPurchases > 0 && <>{ledger.unclaimableVatPurchases} purchase{ledger.unclaimableVatPurchases === 1 ? "" : "s"} with VAT {ledger.unclaimableVatPurchases === 1 ? "is" : "are"} missing the supplier TIN, receipt number or SDC ID, so {ledger.unclaimableVatPurchases === 1 ? "its" : "their"} VAT is not being claimed. <Link className="font-semibold underline" href="/purchases">Fix them</Link>.</>,
  ].filter(Boolean);
  if (items.length === 0) return null;
  return <section className="mb-5 space-y-2">{items.map((item, index) => <p key={index} className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={16} /><span>{item}</span></p>)}</section>;
}

function SalesTable({ ledger, period }: { ledger: Ledger; period: TaxPeriod }) {
  return <section className="card mb-5 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0"><div><h2 className="font-bold text-[#0b1f3a]">Sales ledger</h2><p className="mt-1 text-sm text-slate-500">Issued EBM invoices dated in {period.label}.</p></div><Downloads kind="sales" period={period} /></div>
    <div className="table-wrap mt-4"><table className="data-table mobile-card-table"><thead><tr><th>Date</th><th>Receipt no.</th><th>SDC ID</th><th>Buyer TIN</th><th>Buyer</th><th>Excl. VAT</th><th>VAT</th><th>Total</th></tr></thead><tbody>
      {ledger.sales.map((row) => <tr key={row.id}><td>{formatDate(row.receiptDate)}</td><td className="font-mono text-xs"><Link className="hover:underline" href={`/invoices/${row.id}`}>{row.receiptNumber}</Link></td><td className="font-mono text-xs">{row.sdcId}</td><td className="font-mono text-xs">{row.buyerTin || "—"}</td><td>{row.buyerName || row.buyerPhone}</td><td>{formatRwf(row.netAmount)}</td><td>{formatRwf(row.vatAmount)}</td><td className="font-semibold">{formatRwf(row.totalAmount)}</td></tr>)}
      {ledger.sales.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-500">No issued invoices in this period.</td></tr> : <tr className="bg-slate-50 font-bold"><td colSpan={5}>Total</td><td>{formatRwf(ledger.totals.salesNet)}</td><td>{formatRwf(ledger.totals.outputVat)}</td><td>{formatRwf(ledger.totals.salesGross)}</td></tr>}
    </tbody></table></div>
  </section>;
}

function PurchasesTable({ ledger, period }: { ledger: Ledger; period: TaxPeriod }) {
  return <section className="card mb-5 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0"><div><h2 className="font-bold text-[#0b1f3a]">Purchases ledger</h2><p className="mt-1 text-sm text-slate-500">Purchases dated in {period.label}. Only rows marked claimable count toward input VAT, and only they go in the e-Tax annex.</p></div><Downloads kind="purchases" period={period} /></div>
    <div className="table-wrap mt-4"><table className="data-table mobile-card-table"><thead><tr><th>Date</th><th>Receipt no.</th><th>SDC ID</th><th>Supplier TIN</th><th>Supplier</th><th>Excl. VAT</th><th>VAT</th><th>Total</th><th>Input VAT</th></tr></thead><tbody>
      {ledger.purchases.map((row) => <tr key={row.id}><td>{formatDate(row.purchaseDate)}</td><td className="font-mono text-xs">{row.receiptNumber || "—"}</td><td className="font-mono text-xs">{row.sdcId || "—"}</td><td className="font-mono text-xs">{row.supplierTin || "—"}</td><td>{row.supplierName}<p className="mt-0.5 text-xs text-slate-500">{row.category}</p></td><td>{formatRwf(row.netAmount)}</td><td>{formatRwf(row.vatAmount)}</td><td className="font-semibold">{formatRwf(row.totalAmount)}</td><td>{row.claimable ? <span className="text-xs font-semibold text-emerald-700">Claimable</span> : <span className="text-xs text-slate-400">{row.vatAmount > 0 ? "Not claimable" : "No VAT"}</span>}</td></tr>)}
      {ledger.purchases.length === 0 ? <tr><td colSpan={9} className="py-8 text-center text-sm text-slate-500">No purchases in this period.</td></tr> : <tr className="bg-slate-50 font-bold"><td colSpan={5}>Total</td><td>{formatRwf(ledger.totals.purchasesNet)}</td><td>{formatRwf(ledger.purchases.reduce((sum, row) => sum + row.vatAmount, 0))}</td><td>{formatRwf(ledger.totals.purchasesGross)}</td><td>{formatRwf(ledger.totals.inputVat)}</td></tr>}
    </tbody></table></div>
  </section>;
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ year?: string; q?: string }> }) {
  const params = await searchParams;
  const period = periodFromParams(params);
  const db = getDb();
  const [ledger, firstSale, firstPurchase] = await Promise.all([
    loadLedger(period),
    db.invoice.findFirst({ where: { receiptDate: { not: null } }, orderBy: { receiptDate: "asc" }, select: { receiptDate: true } }),
    db.purchase.findFirst({ orderBy: { purchaseDate: "asc" }, select: { purchaseDate: true } }),
  ]);
  const thisYear = new Date().getUTCFullYear();
  const firstYear = Math.min(thisYear, firstSale?.receiptDate?.getUTCFullYear() ?? thisYear, firstPurchase?.purchaseDate.getUTCFullYear() ?? thisYear);
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, index) => thisYear - index);
  const { totals } = ledger;
  const isYear = period.quarter === null;
  const profit = totals.salesNet - totals.expenses;
  const tab = (active: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

  return <>
    <PageHeader eyebrow="Finance · RRA" title="Tax & Finance" description="Quarterly VAT and the yearly income tax picture, built from your issued EBM invoices and recorded purchases. Download the ledgers to fill in the declaration on RRA e-Tax." />

    <section className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5">{years.map((year) => <Link key={year} className={tab(year === period.year)} href={`/tax?year=${year}&q=${period.quarter ?? "year"}`}>{year}</Link>)}</div>
      <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4].map((quarter) => <Link key={quarter} className={tab(period.quarter === quarter)} href={`/tax?year=${period.year}&q=${quarter}`}>Q{quarter} VAT</Link>)}<Link className={tab(isYear)} href={`/tax?year=${period.year}&q=year`}>Full year</Link></div>
    </section>

    <Warnings ledger={ledger} />

    {!isYear ? <>
      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Output VAT (on sales)" value={formatRwf(totals.outputVat)} hint={`${plural(ledger.sales.length, "invoice")} · ${formatRwf(totals.salesNet)} excl. VAT`} Icon={TrendingUp} />
        <Metric label="Input VAT (on purchases)" value={formatRwf(totals.inputVat)} hint={plural(ledger.purchases.filter((row) => row.claimable).length, "claimable receipt")} Icon={ShoppingCart} />
        <Metric label={totals.vatPayable >= 0 ? "VAT to pay" : "VAT credit to carry forward"} value={formatRwf(Math.abs(totals.vatPayable))} hint="Output VAT minus input VAT" Icon={Landmark} tone={totals.vatPayable > 0 ? "bad" : "good"} />
        <Metric label="Declare and pay by" value={formatDate(vatDueDate(period))} hint={`For ${period.label}, on RRA e-Tax`} Icon={CalendarClock} />
      </section>
      <SalesTable ledger={ledger} period={period} />
      <PurchasesTable ledger={ledger} period={period} />
    </> : <>
      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Turnover (excl. VAT)" value={formatRwf(totals.salesNet)} hint={plural(ledger.sales.length, "issued invoice")} Icon={TrendingUp} />
        <Metric label="Deductible expenses" value={formatRwf(totals.expenses)} hint={totals.capitalSpend ? `Plus ${formatRwf(totals.capitalSpend)} equipment, depreciated separately` : "Purchases, net of claimed VAT"} Icon={ShoppingCart} />
        <Metric label="Estimated profit" value={formatRwf(profit)} hint={`Indicative income tax at ${CIT_RATE_PERCENT}%: ${formatRwf(Math.max(0, Math.round((profit * CIT_RATE_PERCENT) / 100)))}`} Icon={Landmark} tone={profit < 0 ? "bad" : undefined} />
        <Metric label="Annual return due" value={formatDate(incomeTaxDueDate(period.year))} hint={`Income tax for ${period.year}, on RRA e-Tax`} Icon={CalendarClock} />
      </section>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_380px]">
        <section className="card overflow-hidden">
          <div className="p-5 pb-0"><h2 className="font-bold text-[#0b1f3a]">VAT by quarter</h2></div>
          <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Quarter</th><th>Sales excl. VAT</th><th>Output VAT</th><th>Purchases excl. VAT</th><th>Input VAT</th><th>VAT payable</th></tr></thead><tbody>
            {ledger.byQuarter.map((row) => <tr key={row.quarter}><td><Link className="font-semibold hover:underline" href={`/tax?year=${period.year}&q=${row.quarter}`}>Q{row.quarter}</Link></td><td>{formatRwf(row.salesNet)}</td><td>{formatRwf(row.outputVat)}</td><td>{formatRwf(row.purchasesNet)}</td><td>{formatRwf(row.inputVat)}</td><td className="font-semibold">{formatRwf(row.vatPayable)}</td></tr>)}
            <tr className="bg-slate-50 font-bold"><td>{period.year}</td><td>{formatRwf(totals.salesNet)}</td><td>{formatRwf(totals.outputVat)}</td><td>{formatRwf(totals.purchasesNet)}</td><td>{formatRwf(totals.inputVat)}</td><td>{formatRwf(totals.vatPayable)}</td></tr>
          </tbody></table></div>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-bold text-[#0b1f3a]">Expenses by category</h2>
          {ledger.byCategory.length === 0 ? <p className="text-sm text-slate-500">No purchases recorded for {period.year}.</p> : <ul className="space-y-2 text-sm">{ledger.byCategory.map(([category, amount]) => <li key={category} className="flex justify-between gap-3"><span className={category === CAPITAL_CATEGORY ? "text-slate-400" : ""}>{category}</span><span className="font-semibold">{formatRwf(amount)}</span></li>)}</ul>}
          <p className="mt-4 text-xs leading-5 text-slate-400">An estimate to plan with, not the return. Equipment is depreciated rather than expensed, and your accountant may add or disallow items.</p>
        </section>
      </div>
      <SalesTable ledger={ledger} period={period} />
      <PurchasesTable ledger={ledger} period={period} />
    </>}

    <section className="card p-5">
      <h2 className="font-bold text-[#0b1f3a]">Import an annex you already filed</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500">Upload a Sales_Ver_1.1.txt or Purchase_Ver_1.1.txt from an earlier e-Tax declaration to bring that quarter in. Receipts already here are skipped.</p>
      <AnnexImport />
    </section>
  </>;
}
