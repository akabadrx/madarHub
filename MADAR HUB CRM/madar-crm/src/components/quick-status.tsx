"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateLeadStatus } from "@/app/actions";
import { LEAD_STATUSES } from "@/lib/constants";

export function QuickStatus({ leadId, status }: { leadId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  return <select aria-label="Update lead status" disabled={pending} value={status} className="field min-h-9 min-w-40 py-1.5 text-xs font-semibold" onChange={(event) => { const next = event.target.value; startTransition(async () => { try { await updateLeadStatus(leadId, next); toast.success("Status updated"); } catch { toast.error("Status update failed"); } }); }}>{LEAD_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>;
}
