import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { recordInvoiceReceipt, voidInvoice } from "@/app/tax-actions";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getDb } from "@/lib/db";
import { amount, cents, invoicePaymentMethod, isoDay, kigaliDay, VAT_RATE_PERCENT } from "@/lib/tax";
import { formatDate, formatRwf, leadDisplayName } from "@/lib/utils";

export const metadata = { title: "EBM invoice" };

const STATUS_LABELS: Record<string, string> = { draft: "Draft", issued: "Issued", void: "Void" };

/** One line of the EBM sheet: what to type, and a button to copy it. */
function Row({ step, label, value, copy, hint }: { step?: number; label: string; value: string; copy?: string; hint?: string }) {
  return <div className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
    {step ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0b1f3a] text-xs font-bold text-white">{step}</span> : <span className="w-6 shrink-0" />}
    <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{label}</p><p className="break-words font-semibold text-[#0b1f3a]">{value}</p>{hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}</div>
    {copy !== undefined && <CopyButton text={copy} className="min-h-8 shrink-0 px-2.5 text-xs" />}
  </div>;
}

function ReceiptForm({ id, receiptNumber, sdcId, receiptDate }: { id: string; receiptNumber?: string | null; sdcId?: string | null; receiptDate?: Date | null }) {
  return <form action={recordInvoiceReceipt} className="space-y-3">
    <input type="hidden" name="id" value={id} />
    <div><label className="label">Receipt number *</label><input className="field font-mono" name="receiptNumber" required defaultValue={receiptNumber ?? ""} placeholder="e.g. 12" /></div>
    <div><label className="label">SDC ID *</label><input className="field font-mono" name="sdcId" required defaultValue={sdcId ?? ""} placeholder="e.g. SDC010206195" /></div>
    <div><label className="label">Date on the receipt *</label><input className="field" type="date" name="receiptDate" required defaultValue={receiptDate ? isoDay(receiptDate) : kigaliDay(new Date())} /></div>
    <button className="btn btn-primary w-full">{receiptNumber ? "Save receipt details" : "Mark as issued"}</button>
  </form>;
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const invoice = await getDb().invoice.findUnique({ where: { id }, include: { lead: { select: { id: true, name: true, phone: true } } } });
  if (!invoice) notFound();
  const method = invoice.paymentMethod ? invoicePaymentMethod(invoice.paymentMethod) : undefined;
  const [unitPrice, total, vat] = [amount(invoice.unitPrice), amount(invoice.totalAmount), amount(invoice.vatAmount)];
  const net = cents(total - vat);
  const buyer = invoice.buyerName || invoice.buyerPhone || invoice.buyerTin || "Buyer";

  return <>
    <Link href="/invoices" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft size={15} />Invoices</Link>
    <PageHeader eyebrow="EBM invoice" title={buyer} description={`${invoice.itemName} · ${formatRwf(total)}${invoice.paymentDate ? ` paid ${formatDate(invoice.paymentDate)}` : ""}`} action={<StatusBadge status={STATUS_LABELS[invoice.status] ?? invoice.status} />} />

    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <section className="card p-5">
        <h2 className="font-bold text-[#0b1f3a]">Enter this in EBM</h2>
        <p className="mb-2 mt-1 text-sm text-slate-500">In the order the EBM sale screen asks for it. Copy each value across so nothing is retyped wrong.</p>
        <Row step={1} label="Customer TIN" value={invoice.buyerTin || "None — individual buyer"} copy={invoice.buyerTin ?? undefined} hint={invoice.buyerTin ? "EBM fills in the registered company name from the TIN; check it matches below." : "Leave the TIN empty in EBM."} />
        <Row label="Customer name" value={invoice.buyerName || "—"} copy={invoice.buyerName ?? undefined} />
        <Row step={2} label="Customer phone" value={invoice.buyerPhone || "—"} copy={invoice.buyerPhone ?? undefined} />
        <Row step={3} label="Item" value={invoice.itemName} copy={invoice.itemName} />
        <Row label="Quantity" value={String(invoice.quantity)} copy={String(invoice.quantity)} />
        <Row label="Unit price (VAT inclusive)" value={formatRwf(unitPrice)} copy={String(unitPrice)} />
        <Row label="Tax type" value={`B — ${VAT_RATE_PERCENT}% VAT`} />
        <Row step={4} label="Payment type" value={method?.ebm ?? "Not recorded"} hint={method ? `Paid by ${method.label.toLowerCase()}${invoice.paymentDate ? ` on ${formatDate(invoice.paymentDate)}` : ""}${invoice.paymentReference ? `, ref. ${invoice.paymentReference}` : ""}` : undefined} />
        <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <p><span className="block text-xs text-slate-500">Total excl. VAT</span><b className="text-[#0b1f3a]">{formatRwf(net)}</b></p>
          <p><span className="block text-xs text-slate-500">VAT {VAT_RATE_PERCENT}%</span><b className="text-[#0b1f3a]">{formatRwf(vat)}</b></p>
          <p><span className="block text-xs text-slate-500">Total to pay</span><b className="text-[#0b1f3a]">{formatRwf(total)}</b></p>
        </div>
        <p className="mt-2 text-xs text-slate-400">Check these against the receipt EBM prints. EBM may round VAT by a franc differently.</p>
        {invoice.notes && <p className="mt-4 text-sm text-slate-600"><span className="font-semibold">Notes:</span> {invoice.notes}</p>}
        {invoice.lead && <p className="mt-4 text-sm"><Link className="font-semibold text-[#9a7110] hover:underline" href={`/leads/${invoice.lead.id}`}>Open {leadDisplayName(invoice.lead.name, invoice.lead.phone)} in the CRM</Link></p>}
      </section>

      <div className="space-y-4">
        {invoice.status === "draft" && <section className="card p-5">
          <h2 className="font-bold text-[#0b1f3a]">Record the EBM receipt</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">After EBM prints the receipt, copy these two from it. That files the sale for your VAT return, where it appears as SDC ID/receipt number.</p>
          {error === "duplicate" && <p className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Another invoice already has that receipt number and SDC ID.</p>}
          <ReceiptForm id={invoice.id} />
        </section>}

        {invoice.status !== "draft" && <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-[#0b1f3a]">{invoice.status === "issued" && <CheckCircle2 className="text-emerald-600" size={18} />}EBM receipt</h2>
          <Row label="Receipt number" value={invoice.receiptNumber ?? "—"} copy={invoice.receiptNumber ?? undefined} />
          <Row label="SDC ID" value={invoice.sdcId ?? "—"} copy={invoice.sdcId ?? undefined} />
          <Row label="Receipt date" value={formatDate(invoice.receiptDate)} />
          {invoice.status === "issued" && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">Correct a typo</summary><div className="mt-3">{error === "duplicate" && <p className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Another invoice already has that receipt number and SDC ID.</p>}<ReceiptForm id={invoice.id} receiptNumber={invoice.receiptNumber} sdcId={invoice.sdcId} receiptDate={invoice.receiptDate} /></div></details>}
          {invoice.status === "void" && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Voided{invoice.voidReason ? `: ${invoice.voidReason}` : ""}. Left out of every VAT and income total.</p>}
        </section>}

        {invoice.status !== "void" && <section className="card p-5">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-600">{invoice.status === "draft" ? "Delete this draft" : "Void this invoice"}</summary>
            <form action={voidInvoice} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={invoice.id} />
              {invoice.status === "issued" && <><p className="text-sm text-slate-500">Issue a refund receipt for it in EBM first. The invoice stays on file, marked void, and its payment can be invoiced again.</p><div><label className="label">Reason *</label><input className="field" name="reason" required placeholder="e.g. Wrong TIN, refunded with receipt 1240" /></div></>}
              <button className="btn btn-outline w-full text-rose-700">{invoice.status === "draft" ? "Delete draft" : "Void invoice"}</button>
            </form>
          </details>
        </section>}
      </div>
    </div>
  </>;
}
