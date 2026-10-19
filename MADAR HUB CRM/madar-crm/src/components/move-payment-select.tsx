"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { movePaymentToSubscription } from "@/app/actions";

type Option = { id: string; name: string };

/** Re-points one payment at another of the person's subscriptions. */
export function MovePaymentSelect({ paymentId, value, subscriptions }: { paymentId: string; value: string | null; subscriptions: Option[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Subscription this payment renews"
      className="field min-h-9 min-w-40 py-1 text-xs"
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value || null;
        startTransition(async () => {
          try {
            await movePaymentToSubscription(paymentId, next);
            toast.success("Payment moved");
          } catch {
            toast.error("Could not move payment");
          }
        });
      }}
    >
      <option value="">None (one-off)</option>
      {subscriptions.map((sub) => <option value={sub.id} key={sub.id}>{sub.name}</option>)}
    </select>
  );
}
