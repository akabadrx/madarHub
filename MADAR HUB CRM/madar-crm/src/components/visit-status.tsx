"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateVisitStatus } from "@/app/actions";
import { VISIT_STATUSES } from "@/lib/constants";

export function VisitStatus({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  return <select disabled={pending} value={status} className="field min-h-9 py-1.5 text-xs font-semibold" onChange={(event) => startTransition(async () => { try { await updateVisitStatus(id, event.target.value); toast.success("Visit updated"); } catch { toast.error("Could not update visit"); } })}>{VISIT_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>;
}
