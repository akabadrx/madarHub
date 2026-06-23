"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createPayment, createPaymentForm } from "@/app/actions";
import { PAYMENT_METHODS } from "@/lib/constants";
import { paymentSchema } from "@/lib/validation";

type FormValues = z.input<typeof paymentSchema>;
type Option = { id: string; name: string };
type PackageOption = Option & { price: number };

export function PaymentForm({ leads, packages, defaultLeadId }: { leads: Option[]; packages: PackageOption[]; defaultLeadId?: string }) {
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(paymentSchema), defaultValues: { leadId: defaultLeadId || "", packageId: "", amount: 0, paymentMethod: "MoMo Pay", paymentDate: new Date().toISOString().slice(0, 10), notes: "" } });
  return <form action={createPaymentForm} className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((values) => startTransition(async () => { try { await createPayment(values); toast.success("Payment recorded"); reset({ leadId: defaultLeadId || "", packageId: "", amount: 0, paymentMethod: "MoMo Pay", paymentDate: new Date().toISOString().slice(0, 10), notes: "" }); } catch { toast.error("Could not record payment"); } }))}>
    <div><label className="label">Lead / customer *</label>{defaultLeadId ? <><input type="hidden" value={defaultLeadId} {...register("leadId")} /><div className="field bg-slate-50 font-semibold">{leads.find((lead) => lead.id === defaultLeadId)?.name}</div></> : <select aria-label="Lead or customer" className="field" {...register("leadId")}><option value="">Select lead</option>{leads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name}</option>)}</select>}{errors.leadId && <p className="mt-1 text-xs text-red-600">Select a lead</p>}</div>
    <div><label className="label">Package</label><select aria-label="Package" className="field" {...register("packageId")} onChange={(event) => { const pkg = packages.find((item) => item.id === event.target.value); setValue("packageId", event.target.value); if (pkg) setValue("amount", pkg.price); }}><option value="">Unassigned payment</option>{packages.map((pkg) => <option value={pkg.id} key={pkg.id}>{pkg.name}</option>)}</select></div>
    <div><label className="label">Amount (RWF) *</label><input aria-label="Amount in RWF" className="field" type="number" min="1" {...register("amount")} />{errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}</div>
    <div><label className="label">Payment method *</label><select aria-label="Payment method" className="field" {...register("paymentMethod")}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
    <div><label className="label">Payment date *</label><input aria-label="Payment date" className="field" type="date" {...register("paymentDate")} /></div>
    <div><label className="label">Notes</label><input aria-label="Payment notes" className="field" placeholder="Reference or confirmation details" {...register("notes")} /></div>
    <div className="sm:col-span-2 flex justify-end"><button className="btn btn-primary" disabled={pending}>{pending ? "Recording..." : "Record payment"}</button></div>
  </form>;
}
