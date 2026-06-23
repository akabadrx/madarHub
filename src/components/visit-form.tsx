"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { createVisit, createVisitForm } from "@/app/actions";
import { VISIT_STATUSES } from "@/lib/constants";
import { visitSchema } from "@/lib/validation";

type FormValues = z.input<typeof visitSchema>;
type Option = { id: string; name: string };

export function VisitForm({ leads, defaultLeadId }: { leads: Option[]; defaultLeadId?: string }) {
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset } = useForm<FormValues>({ resolver: zodResolver(visitSchema), defaultValues: { leadId: defaultLeadId || "", visitDate: "", status: "Scheduled", notes: "" } });
  return <form action={createVisitForm} className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((values) => startTransition(async () => { try { await createVisit(values); toast.success("Visit scheduled"); reset({ leadId: defaultLeadId || "", visitDate: "", status: "Scheduled", notes: "" }); } catch { toast.error("Could not save visit"); } }))}>
    <div><label className="label">Lead *</label>{defaultLeadId ? <><input type="hidden" value={defaultLeadId} {...register("leadId")} /><div className="field bg-slate-50 font-semibold">{leads.find((lead) => lead.id === defaultLeadId)?.name}</div></> : <select aria-label="Visit lead" className="field" {...register("leadId")}><option value="">Select lead</option>{leads.map((lead) => <option value={lead.id} key={lead.id}>{lead.name}</option>)}</select>}</div>
    <div><label className="label">Visit date and time *</label><input aria-label="Visit date and time" className="field" type="datetime-local" {...register("visitDate")} /></div>
    <div><label className="label">Status</label><select aria-label="Visit status" className="field" {...register("status")}>{VISIT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div>
    <div><label className="label">Notes</label><input aria-label="Visit notes" className="field" placeholder="Expected arrival or context" {...register("notes")} /></div>
    <div className="sm:col-span-2 flex justify-end"><button className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : "Schedule visit"}</button></div>
  </form>;
}
