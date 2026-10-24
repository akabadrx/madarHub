"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { savePurchase } from "@/app/tax-actions";
import { PURCHASE_CATEGORIES, vatFromInclusive } from "@/lib/tax";
import { purchaseSchema } from "@/lib/validation";

type FormValues = z.input<typeof purchaseSchema>;

export function PurchaseForm() {
  const [pending, startTransition] = useTransition();
  // Most suppliers charge 18% VAT; untick for rent from an individual, salaries,
  // bank fees and anything else bought without VAT.
  const [withVat, setWithVat] = useState(true);
  const blank = (): FormValues => ({ supplierTin: "", supplierName: "", description: "", category: "Office supplies", purchaseDate: new Date().toISOString().slice(0, 10), receiptNumber: "", sdcId: "", totalAmount: 0, vatAmount: 0, notes: "" });
  const { register, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(purchaseSchema), defaultValues: blank() });
  const fillVat = (vat: boolean) => setValue("vatAmount", vat ? vatFromInclusive(Number(getValues("totalAmount")) || 0) : 0);

  return <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit((values) => startTransition(async () => {
    try { await savePurchase(values); toast.success("Purchase recorded"); reset(blank()); setWithVat(true); } catch { toast.error("Could not record the purchase"); }
  }))}>
    <div><label className="label">Date on the receipt *</label><input aria-label="Purchase date" className="field" type="date" {...register("purchaseDate")} /></div>
    <div><label className="label">Supplier TIN</label><input aria-label="Supplier TIN" className="field font-mono" inputMode="numeric" placeholder="9 digits" {...register("supplierTin")} />{errors.supplierTin && <p className="mt-1 text-xs text-red-600">{errors.supplierTin.message}</p>}</div>
    <div><label className="label">Supplier name *</label><input aria-label="Supplier name" className="field" {...register("supplierName")} />{errors.supplierName && <p className="mt-1 text-xs text-red-600">{errors.supplierName.message}</p>}</div>
    <div><label className="label">Receipt number</label><input aria-label="Receipt number" className="field font-mono" placeholder="e.g. 125" {...register("receiptNumber")} /></div>
    <div><label className="label">SDC ID</label><input aria-label="SDC ID" className="field font-mono" placeholder="e.g. SDC010068371" {...register("sdcId")} /></div>
    <div><label className="label">Category *</label><select aria-label="Category" className="field" {...register("category")}>{PURCHASE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
    <div><label className="label">Total incl. VAT (RWF) *</label><input aria-label="Total including VAT" className="field" type="number" min="0.01" step="0.01" {...register("totalAmount", { onChange: () => fillVat(withVat) })} />{errors.totalAmount && <p className="mt-1 text-xs text-red-600">{errors.totalAmount.message}</p>}</div>
    <div><label className="label flex items-center justify-between gap-2"><span>VAT amount (RWF)</span><span className="flex items-center gap-1.5 font-normal text-slate-500"><input type="checkbox" className="accent-[#0b1f3a]" checked={withVat} onChange={(event) => { setWithVat(event.target.checked); fillVat(event.target.checked); }} />18% VAT charged</span></label><input aria-label="VAT amount" className="field" type="number" min="0" step="0.01" {...register("vatAmount")} />{errors.vatAmount && <p className="mt-1 text-xs text-red-600">{errors.vatAmount.message}</p>}</div>
    <div><label className="label">What was bought</label><input aria-label="Description" className="field" placeholder="e.g. October internet" {...register("description")} /></div>
    <div className="sm:col-span-2"><label className="label">Notes</label><input aria-label="Purchase notes" className="field" {...register("notes")} /></div>
    <div className="flex items-end justify-end"><button className="btn btn-primary w-full sm:w-auto" disabled={pending}>{pending ? "Saving..." : "Record purchase"}</button></div>
  </form>;
}
