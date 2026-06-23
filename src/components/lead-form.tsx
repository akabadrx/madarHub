"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { saveLead, saveLeadForm } from "@/app/actions";
import { INTERESTS, LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { leadSchema } from "@/lib/validation";
import { toDateTimeLocal } from "@/lib/utils";

type FormValues = z.input<typeof leadSchema>;
type PackageOption = { id: string; name: string; price: number };
type InitialLead = {
  id?: string; name?: string | null; phone?: string; source?: string; interest?: string | null;
  suggestedPackageId?: string | null; status?: string; visitDate?: Date | string | null;
  followUpDate?: Date | string | null; paymentStatus?: string; amountPaid?: number; notes?: string | null;
};

export function LeadForm({ packages, initial }: { packages: PackageOption[]; initial?: InitialLead }) {
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      id: initial?.id,
      name: initial?.name || "",
      phone: initial?.phone || "",
      source: (initial?.source || "Meta Ads") as FormValues["source"],
      interest: (initial?.interest || "Not Sure") as FormValues["interest"],
      suggestedPackageId: initial?.suggestedPackageId || "",
      status: (initial?.status || "New Lead") as FormValues["status"],
      visitDate: toDateTimeLocal(initial?.visitDate),
      followUpDate: toDateTimeLocal(initial?.followUpDate),
      paymentStatus: initial?.paymentStatus || "Pending",
      amountPaid: initial?.amountPaid || 0,
      notes: initial?.notes || "",
    },
  });

  const submit = (values: FormValues) => startTransition(async () => {
    try { await saveLead(values); }
    catch (error) { if ((error as Error).message.includes("NEXT_REDIRECT")) throw error; toast.error("Could not save lead. Check the fields and database connection."); }
  });

  return (
    <form action={saveLeadForm} onSubmit={handleSubmit(submit)} className="card p-5 sm:p-7">
      <div className="grid gap-5 md:grid-cols-2">
        <div><label className="label">Name <span className="font-normal text-slate-400">(recommended)</span></label><input aria-label="Name" className="field" placeholder="Lead name" {...register("name")} /></div>
        <div><label className="label">Phone *</label><input aria-label="Phone" className="field" placeholder="250 788 000 000" inputMode="tel" {...register("phone")} />{errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}</div>
        <div><label className="label">Lead source *</label><select aria-label="Lead source" className="field" {...register("source")}>{LEAD_SOURCES.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div><label className="label">Need / interest</label><select aria-label="Need or interest" className="field" {...register("interest")}>{INTERESTS.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div><label className="label">Suggested package</label><select aria-label="Suggested package" className="field" {...register("suggestedPackageId")}><option value="">No package selected</option>{packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name} - {pkg.price.toLocaleString()} RWF</option>)}</select></div>
        <div><label className="label">Status *</label><select aria-label="Status" className="field border-[#d4a72c] bg-[#fffdf7] font-semibold" {...register("status")}>{LEAD_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div><label className="label">Visit date and time</label><input aria-label="Visit date and time" className="field" type="datetime-local" {...register("visitDate")} /></div>
        <div><label className="label">Follow-up date and time</label><input aria-label="Follow-up date and time" className="field" type="datetime-local" {...register("followUpDate")} /></div>
        {initial?.id && <><div><label className="label">Payment status</label><select aria-label="Payment status" className="field" {...register("paymentStatus")}><option>Pending</option><option>Partially Paid</option><option>Paid</option><option>Refunded</option></select></div><div><label className="label">Amount paid</label><input aria-label="Amount paid" className="field" type="number" min="0" {...register("amountPaid")} /></div></>}
        <div className="md:col-span-2"><label className="label">Notes</label><textarea aria-label="Notes" className="field min-h-28 resize-y" placeholder="Context from the WhatsApp conversation..." {...register("notes")} /></div>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3"><button className="btn btn-primary min-w-32" disabled={pending}>{pending ? "Saving..." : initial?.id ? "Save changes" : "Create lead"}</button></div>
    </form>
  );
}
