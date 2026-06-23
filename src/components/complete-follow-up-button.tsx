"use client";

import { CheckCircle2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { completeFollowUp } from "@/app/actions";

export function CompleteFollowUpButton({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  return <button className="btn btn-outline" disabled={pending} onClick={() => startTransition(async () => { try { await completeFollowUp(leadId); toast.success("Follow-up completed"); } catch { toast.error("Could not update follow-up"); } })}><CheckCircle2 size={16} />{pending ? "Updating..." : "Done"}</button>;
}
