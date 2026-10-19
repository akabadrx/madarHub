"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createPayment, createPaymentForm } from "@/app/actions";
import { PAYMENT_METHODS } from "@/lib/constants";
import { paymentSchema } from "@/lib/validation";

type FormValues = z.input<typeof paymentSchema>;
type Option = { id: string; name: string };
type PackageOption = Option & { price: number };
/** An active subscription a payment can renew. */
export type SubscriptionOption = Option & { leadId: string };

export function PaymentForm({ leads, packages, subscriptions = [], defaultLeadId }: { leads: Option[]; packages: PackageOption[]; subscriptions?: SubscriptionOption[]; defaultLeadId?: string }) {
  const [pending, startTransition] = useTransition();
  const blank = (): FormValues => ({ leadId: defaultLeadId || "", packageId: "", subscriptionId: "", subscriptionLabel: "", amount: 0, paymentMethod: "MoMo Pay", paymentDate: new Date().toISOString().slice(0, 10), notes: "" });
  const { register, handleSubmit, reset, setValue, setError, control, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(paymentSchema), defaultValues: blank() });
  const leadId = useWatch({ control, name: "leadId" });
  const subscriptionId = useWatch({ control, name: "subscriptionId" });
  const leadSubscriptions = subscriptions.filter((sub) => sub.leadId === leadId);
  // With one subscription (or none) the server knows which is meant; with
  // several, staff have to say which business the money is for.
  const mustChoose = leadSubscriptions.length > 1;
  return <form action={createPaymentForm} className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((values) => {
    if (mustChoose && !values.subscriptionId) { setError("subscriptionId", { message: "Choose which subscription this payment is for" }); return; }
    startTransition(async () => { try { const result = await createPayment(values); if (result.error) { toast.error(result.error); return; } toast.success("Payment recorded"); reset(blank()); } catch { toast.error("Could not record payment"); } });
  })}>
    <div><label className="label">Lead / customer *</label>{defaultLeadId ? <><input type="hidden" value={defaultLeadId} {...register("leadId")} /><div className="field bg-slate-50 font-semibold">{leads.find((lead) => lead.id === defaultLeadId)?.name}</div></> : <select aria-label="Lead or customer" className="field" {...register("leadId")}><option value="">Select lead</option>{leads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name}</option>)}</select>}{errors.leadId && <p className="mt-1 text-xs text-red-600">Select a lead</p>}</div>
    <div><label className="label">Package</label><select aria-label="Package" className="field" {...register("packageId")} onChange={(event) => { const pkg = packages.find((item) => item.id === event.target.value); setValue("packageId", event.target.value); if (pkg) setValue("amount", Math.round((pkg.price * 118) / 100)); }}><option value="">Unassigned payment</option>{packages.map((pkg) => <option value={pkg.id} key={pkg.id}>{pkg.name}</option>)}</select></div>
    {leadId && <div><label className="label">Subscription{mustChoose ? " *" : ""}</label><select aria-label="Subscription" className="field" {...register("subscriptionId")}><option value="">{mustChoose ? "Choose subscription" : leadSubscriptions.length === 1 ? `${leadSubscriptions[0].name} (current)` : "First subscription, if a renewing plan"}</option>{mustChoose && leadSubscriptions.map((sub) => <option value={sub.id} key={sub.id}>{sub.name}</option>)}<option value="new">New subscription…</option></select>{errors.subscriptionId && <p className="mt-1 text-xs text-red-600">{errors.subscriptionId.message}</p>}</div>}
    {subscriptionId === "new" && <div><label className="label">New subscription name</label><input aria-label="New subscription name" className="field" placeholder="e.g. Zuna Logistics" {...register("subscriptionLabel")} /></div>}
    <div><label className="label">Amount paid, including VAT (RWF) *</label><input aria-label="Amount paid in RWF including VAT" className="field" type="number" min="1" {...register("amount")} />{errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}</div>
    <div><label className="label">Payment method *</label><select aria-label="Payment method" className="field" {...register("paymentMethod")}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
    <div><label className="label">Payment date *</label><input aria-label="Payment date" className="field" type="date" {...register("paymentDate")} /></div>
    <div><label className="label">Notes</label><input aria-label="Payment notes" className="field" placeholder="Reference or confirmation details" {...register("notes")} /></div>
    <div className="sm:col-span-2 flex justify-end"><button className="btn btn-primary" disabled={pending}>{pending ? "Recording..." : "Record payment"}</button></div>
  </form>;
}
