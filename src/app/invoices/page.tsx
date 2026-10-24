import Link from "next/link";
import { FilePlus2, FileText, Receipt, TimerReset } from "lucide-react";
import { InvoiceForm, type KnownBuyer } from "@/components/invoice-form";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getDb } from "@/lib/db";
import { amount, invoiceMethodForPayment, invoicePaymentMethod, kigaliDay } from "@/lib/tax";
import { formatDate, formatRwf, leadDisplayName } from "@/lib/utils";

export const metadata = { title: "Invoices" };

const STATUS_LABELS: Record<string, string> = { draft: "Draft", issued: "Issued", void: "Void" };
/** How far back to look for payments that still need an EBM invoice. */
const UNINVOICED_LOOKBACK_DAYS = 90;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ paymentId?: string; status?: string }> }) {
  const { paymentId, status } = await searchParams;
  const db = getDb();
  const since = new Date(); since.setDate(since.getDate() - UNINVOICED_LOOKBACK_DAYS);
  const [invoices, leads, packages, lastInvoices, uninvoiced, payment, counts] = await Promise.all([
    db.invoice.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 200 }),
    db.lead.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    db.package.findMany({ where: { active: true }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true } }),
    db.invoice.findMany({ where: { leadId: { not: null }, buyerTin: { not: null } }, orderBy: { createdAt: "desc" }, distinct: ["leadId"], select: { leadId: true, buyerTin: true, buyerName: true } }),
    db.payment.findMany({ where: { paymentDate: { gte: since }, invoice: { is: null } }, include: { lead: true, package: true }, orderBy: { paymentDate: "desc" } }),
    paymentId ? db.payment.findUnique({ where: { id: paymentId }, include: { lead: true, package: true, subscription: true, invoice: { select: { id: true } } } }) : null,
    db.invoice.groupBy({ by: ["status"], _count: true }),
  ]);

  const knownBuyers: Record<string, KnownBuyer> = Object.fromEntries(lastInvoices.map((invoice) => [invoice.leadId!, { buyerTin: invoice.buyerTin, buyerName: invoice.buyerName }]));
  const leadOptions = leads.map((lead) => ({ id: lead.id, name: leadDisplayName(lead.name, lead.phone), phone: lead.phone }));

  // Invoicing a recorded payment: everything but the TIN is already known,
  // and a business that holds several subscriptions is billed under the TIN
  // last used for that same subscription.
  let defaults: Parameters<typeof InvoiceForm>[0]["defaults"];
  if (payment && !payment.invoice) {
    const previous = payment.subscriptionId
      ? await db.invoice.findFirst({ where: { payment: { subscriptionId: payment.subscriptionId } }, orderBy: { createdAt: "desc" }, select: { buyerTin: true, buyerName: true } })
      : null;
    const buyer = previous ?? knownBuyers[payment.leadId];
    const method = invoiceMethodForPayment(payment.paymentMethod);
    defaults = {
      paymentId: payment.id,
      leadId: payment.leadId,
      packageId: payment.packageId ?? "",
      buyerTin: buyer?.buyerTin ?? "",
      buyerName: buyer?.buyerName ?? payment.subscription?.label ?? payment.lead.name ?? "",
      buyerPhone: payment.lead.phone,
      itemName: payment.package?.name ?? "",
      quantity: 1,
      unitPrice: payment.amount,
      ...(method ? { paymentMethod: method } : {}),
      paymentDate: kigaliDay(payment.paymentDate),
      paymentReference: payment.notes ?? "",
    };
  }

  const count = (key: string) => counts.find((row) => row.status === key)?._count ?? 0;
  const filters = [["All", undefined], ["Drafts", "draft"], ["Issued", "issued"], ["Void", "void"]] as const;

  return <>
    <PageHeader eyebrow="Finance · RRA EBM" title="Invoices" description="Prepare each sale for EBM, issue it there, then record the receipt number and SDC ID here. Issued invoices make up the sales ledger for your VAT return." />

    <section className="mb-5 grid gap-4 sm:grid-cols-3">
      {([["Waiting for an invoice", uninvoiced.length, TimerReset, `Payments in the last ${UNINVOICED_LOOKBACK_DAYS} days`], ["Drafts not yet in EBM", count("draft"), FileText, "Issue them in EBM, then record the receipt"], ["Issued", count("issued"), Receipt, "On the sales ledger"]] as const).map(([label, value, Icon, hint]) => <div className="card p-5" key={label}><div className="flex justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-[#0b1f3a]">{value}</p><p className="mt-1 text-xs text-slate-400">{hint}</p></div><Icon className="text-[#d4a72c]" size={21} /></div></div>)}
    </section>

    <section className="card mb-5 p-5" id="new">
      <h2 className="mb-1 font-bold text-[#0b1f3a]">{defaults ? "Invoice this payment" : "New invoice"}</h2>
      <p className="mb-4 text-sm text-slate-500">{defaults ? `${leadDisplayName(payment!.lead.name, payment!.lead.phone)} · ${formatRwf(payment!.amount)} on ${formatDate(payment!.paymentDate)}. Add the company TIN and check the rest.` : "Pick a payment below to fill this in, or enter a sale by hand."}</p>
      {payment?.invoice && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">That payment already has an invoice. <Link className="font-semibold underline" href={`/invoices/${payment.invoice.id}`}>Open it</Link></p>}
      <InvoiceForm key={paymentId ?? "new"} leads={leadOptions} packages={packages} knownBuyers={knownBuyers} defaults={defaults} />
    </section>

    {uninvoiced.length > 0 && <section className="card mb-5 overflow-hidden">
      <div className="p-5 pb-0"><h2 className="font-bold text-[#0b1f3a]">Payments waiting for an EBM invoice</h2><p className="mt-1 text-sm text-slate-500">Every taxable sale needs an EBM receipt. Payments from before you started recording invoices here can be invoiced the same way, with the receipt you already issued.</p></div>
      <div className="table-wrap mt-4"><table className="data-table mobile-card-table"><thead><tr><th>Paid</th><th>Customer</th><th>Package</th><th>Method</th><th>Amount</th><th></th></tr></thead><tbody>
        {uninvoiced.map((row) => <tr key={row.id}><td>{formatDate(row.paymentDate)}</td><td><Link className="font-semibold hover:underline" href={`/leads/${row.leadId}`}>{leadDisplayName(row.lead.name, row.lead.phone)}</Link></td><td>{row.package?.name || "Unassigned"}</td><td>{row.paymentMethod}</td><td className="font-semibold">{formatRwf(row.amount)}</td><td><Link className="btn btn-outline min-h-9 text-xs" href={`/invoices?paymentId=${row.id}#new`}><FilePlus2 size={15} />Prepare invoice</Link></td></tr>)}
      </tbody></table></div>
    </section>}

    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0">
        <h2 className="font-bold text-[#0b1f3a]">All invoices</h2>
        <div className="flex flex-wrap gap-1.5">{filters.map(([label, value]) => <Link key={label} href={value ? `/invoices?status=${value}` : "/invoices"} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === value ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</Link>)}</div>
      </div>
      <div className="table-wrap mt-4"><table className="data-table mobile-card-table"><thead><tr><th>Transfer date</th><th>Buyer</th><th>Item</th><th>Paid by</th><th>Total</th><th>VAT</th><th>EBM receipt</th><th>Status</th></tr></thead><tbody>
        {invoices.map((invoice) => <tr key={invoice.id}>
          <td>{formatDate(invoice.paymentDate ?? invoice.receiptDate)}</td>
          <td><Link className="font-semibold hover:underline" href={`/invoices/${invoice.id}`}>{invoice.buyerName || invoice.buyerPhone || invoice.buyerTin}</Link>{invoice.buyerTin && <p className="mt-0.5 font-mono text-xs text-slate-500">TIN {invoice.buyerTin}</p>}</td>
          <td>{invoice.itemName}{invoice.quantity > 1 && ` × ${invoice.quantity}`}</td>
          <td>{invoice.paymentMethod ? invoicePaymentMethod(invoice.paymentMethod)?.label ?? invoice.paymentMethod : "—"}</td>
          <td className="font-semibold">{formatRwf(amount(invoice.totalAmount))}</td>
          <td>{formatRwf(amount(invoice.vatAmount))}</td>
          <td>{invoice.receiptNumber ? <span className="font-mono text-xs">{invoice.receiptNumber}<br />{invoice.sdcId}</span> : <Link className="text-xs font-semibold text-[#9a7110] hover:underline" href={`/invoices/${invoice.id}`}>Open EBM sheet</Link>}</td>
          <td><StatusBadge status={STATUS_LABELS[invoice.status] ?? invoice.status} /></td>
        </tr>)}
        {invoices.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-500">No invoices yet.</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
