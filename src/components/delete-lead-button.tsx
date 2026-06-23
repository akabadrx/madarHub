"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteLead } from "@/app/actions";

export function DeleteLeadButton({ leadId, name }: { leadId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        className="btn btn-outline min-h-9 px-2.5 text-red-600 hover:bg-red-50 hover:border-red-200"
        aria-label={`Delete ${name}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 size={16} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        className="btn min-h-9 bg-red-600 px-2.5 text-white hover:bg-red-700"
        disabled={pending}
        onClick={() => startTransition(async () => {
          try {
            await deleteLead(leadId);
            toast.success("Lead deleted");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not delete lead");
            setConfirming(false);
          }
        })}
      >
        {pending ? <><Trash2 size={16} />Deleting...</> : <><Trash2 size={16} />Delete?</>}
      </button>
      <button
        className="btn btn-outline min-h-9 px-2.5"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        No
      </button>
    </div>
  );
}
