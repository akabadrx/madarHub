"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unstable_rethrow } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createInvoice } from "@/app/tax-actions";
import { saleAmountWithVat } from "@/lib/pricing";
import { INVOICE_PAYMENT_METHODS, vatFromInclusive } from "@/lib/tax";
import { formatRwf } from "@/lib/utils";
import { invoiceSchema } from "@/lib/validation";

type FormValues = z.input<typeof invoiceSchema>;
type LeadOption = { id: string; name: string; phone: string };
type PackageOption = { id: string; name: string; price: number };
/** The buyer details last invoiced to a lead, so a repeat invoice fills itself in. */
export type KnownBuyer = { buyerTin: string | null; buyerName: string | null };

export function InvoiceForm({ leads, packages, knownBuyers, defaults }: { leads: LeadOption[]; packages: PackageOption[]; knownBuyers: Record<string, KnownBuyer>; defaults?: Partial<FormValues> }) {
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: { leadId: "", paymentId: "", packageId: "", buyerTin: "", buyerName: "", buyerPhone: "", itemName: "", quantity: 1, unitPrice: 0, paymentDate: new Date().toISOString().slice(0, 10), paymentReference: "", notes: "", ...defaults },
  });
  const [unitPrice, quantity] = useWatch({ control, name: ["unitPrice", "quantity"] });
  const total = (Number(unitPrice) || 0) * (Number(quantity) || 0);
  const vat = vatFromInclusive(total);
  const fromPayment = Boolean(defaults?.paymentId);

  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((values) => startTransition(async () => {
    try { const result = await createInvoice(values); if (result?.error) toast.error(result.error); }
    catch (error) { unstable_rethrow(error); toast.error("Could not save the invoice"); }
  }))}>
    <input type="hidden" {...register("paymentId")} />
    <div className="sm:col-span-2"><label className="label">Customer in the CRM</label>
      {fromPayment ? <><input type="hidden" {...register("leadId")} /><div className="field bg-slate-50 font-semibold">{leads.find((lead) => lead.id === defaults?.leadId)?.name ?? "Not in the CRM"}</div></> : <select aria-label="Customer" className="field" {...register("leadId")} onChange={(event) => {
        const lead = leads.find((item) => item.id === event.target.value);
        setValue("leadId", event.target.value);
        if (!lead) return;
        setValue("buyerPhone", lead.phone);
        const known = knownBuyers[lead.id];
        setValue("buyerTin", known?.buyerTin || "");
        setValue("buyerName", known?.buyerName || lead.name);
      }}><option value="">Not in the CRM</option>{leads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name}</option>)}</select>}
    </div>
    <div><label className="label">Buyer TIN</label><input aria-label="Buyer TIN" className="field font-mono" inputMode="numeric" placeholder="9 digits — leave empty for an individual" {...register("buyerTin")} />{errors.buyerTin && <p className="mt-1 text-xs text-red-600">{errors.buyerTin.message}</p>}</div>
    <div><label className="label">Company / buyer name</label><input aria-label="Company or buyer name" className="field" placeholder="As registered with RRA" {...register("buyerName")} /></div>
    <div><label className="label">Buyer phone *</label><input aria-label="Buyer phone" className="field" placeholder="07..." {...register("buyerPhone")} />{errors.buyerPhone && <p className="mt-1 text-xs text-red-600">{errors.buyerPhone.message}</p>}</div>
    <div><label className="label">Package</label>
      <select aria-label="Package" className="field" {...register("packageId")} onChange={(event) => {
        const pkg = packages.find((item) => item.id === event.target.value);
        setValue("packageId", event.target.value);
        if (pkg) { setValue("itemName", pkg.name); setValue("unitPrice", saleAmountWithVat(pkg.price)); }
      }}><option value="">Other / custom item</option>{packages.map((pkg) => <option value={pkg.id} key={pkg.id}>{pkg.name}</option>)}</select>
    </div>
    <div><label className="label">Item on the invoice *</label><input aria-label="Item on the invoice" className="field" {...register("itemName")} />{errors.itemName && <p className="mt-1 text-xs text-red-600">{errors.itemName.message}</p>}</div>
    <div className="grid grid-cols-[90px_1fr] gap-3">
      <div><label className="label">Qty *</label><input aria-label="Quantity" className="field" type="number" min="1" {...register("quantity")} /></div>
      <div><label className="label">Unit price incl. VAT (RWF) *</label><input aria-label="Unit price including VAT" className="field" type="number" min="1" {...register("unitPrice")} />{errors.unitPrice && <p className="mt-1 text-xs text-red-600">{errors.unitPrice.message}</p>}</div>
    </div>
    <fieldset className="sm:col-span-2"><legend className="label">How did they pay? *</legend>
      <div className="grid gap-2 sm:grid-cols-3">{INVOICE_PAYMENT_METHODS.map((method) => <label key={method.value} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-sm font-medium has-[:checked]:border-[#d4a72c] has-[:checked]:bg-[#fffaf0]"><input type="radio" value={method.value} className="accent-[#0b1f3a]" {...register("paymentMethod")} />{method.label}</label>)}</div>
      {errors.paymentMethod && <p className="mt-1 text-xs text-red-600">{errors.paymentMethod.message}</p>}
    </fieldset>
    <div><label className="label">Date of transfer *</label><input aria-label="Date of transfer" className="field" type="date" {...register("paymentDate")} /></div>
    <div><label className="label">Transfer reference</label><input aria-label="Transfer reference" className="field" placeholder="Bank slip no., MoMo transaction ID, cheque no." {...register("paymentReference")} /></div>
    <div className="sm:col-span-2"><label className="label">Notes</label><input aria-label="Invoice notes" className="field" placeholder="Period covered, anything to remember" {...register("notes")} /></div>
    <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-x-6 gap-y-1"><span>Excl. VAT <b className="text-[#0b1f3a]">{formatRwf(total - vat)}</b></span><span>VAT 18% <b className="text-[#0b1f3a]">{formatRwf(vat)}</b></span><span>Total <b className="text-[#0b1f3a]">{formatRwf(total)}</b></span></div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : "Prepare EBM invoice"}</button>
    </div>
  </form>;
}
