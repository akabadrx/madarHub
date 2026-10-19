"use client";

import { useActionState, useState } from "react";
import { startCheckout, type CheckoutState } from "@/app/checkout-actions";
import { useMomoCheckout } from "@/components/package-picker";
import { WHATSAPP_NUMBER } from "@/lib/site";

const initialState: CheckoutState = {};

export type SubscriptionItem = {
  id: string;
  name: string;
  /** The plan, shown under the name when the subscription has its own label. */
  planName: string | null;
  /** Null when the plan cannot be bought online; renewal then goes via WhatsApp. */
  packageSlug: string | null;
  /** "Active" | "Delayed Payment" | "Suspended", or null before the first payment. */
  status: string | null;
  /** Already formatted on the server, in Kigali time. */
  nextPayment: string | null;
  dueText: string;
  isDue: boolean;
};

const BADGE_CLASS: Record<string, string> = {
  Active: "active",
  "Delayed Payment": "delayed",
  Suspended: "suspended",
};

/**
 * One row per subscription, each renewed on its own. The Renew buttons carry
 * the subscription id, so a payment for Zuna Logistics can never land on Zuna
 * Real Estate — which is what a package-only checkout could not tell apart.
 */
export function SubscriptionList({
  subscriptions,
  momoAvailable = false,
}: {
  subscriptions: SubscriptionItem[];
  momoAvailable?: boolean;
}) {
  const [state, formAction, pending] = useActionState(startCheckout, initialState);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const { momo, momoStarting, start, dialog } = useMomoCheckout();
  const busyAnywhere = pending || momoStarting || momo.phase === "waiting";

  return (
    <>
      {state.error ? (
        <p className="mp-alert error" role="alert" style={{ marginBottom: 18 }}>
          {state.error}
        </p>
      ) : null}

      <ul className="mp-subs">
        {subscriptions.map((sub) => {
          const busy = submitting === sub.id;
          const whatsapp = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            `Hello Madar Hub, I want to renew my subscription: ${sub.name}`,
          )}`;
          return (
            <li className={`mp-sub${sub.isDue ? " is-due" : ""}`} key={sub.id}>
              <div className="mp-sub-main">
                <div className="mp-sub-title">
                  <h3>{sub.name}</h3>
                  <span className={`mp-badge ${sub.status ? (BADGE_CLASS[sub.status] ?? "none") : "none"}`}>
                    {sub.status ?? "Not started"}
                  </span>
                </div>
                {sub.planName ? <p className="mp-sub-plan">{sub.planName}</p> : null}
                <p className="mp-sub-meta">
                  {sub.nextPayment ? <>Next payment {sub.nextPayment} &middot; </> : null}
                  <span className={sub.isDue ? "mp-sub-due" : undefined}>{sub.dueText}</span>
                </p>
              </div>

              <div className="mp-sub-actions">
                {sub.packageSlug ? (
                  <>
                    {momoAvailable ? (
                      <button
                        type="button"
                        className="button pesapal"
                        disabled={busyAnywhere}
                        onClick={() => {
                          setSubmitting(sub.id);
                          start(sub.packageSlug!, sub.id);
                        }}
                      >
                        {busy && momoStarting ? "Sending prompt…" : "Renew with MoMo"}
                      </button>
                    ) : null}
                    <form action={formAction}>
                      <input type="hidden" name="packageSlug" value={sub.packageSlug} />
                      <input type="hidden" name="subscriptionId" value={sub.id} />
                      <button
                        type="submit"
                        className={momoAvailable ? "button outline" : "button pesapal"}
                        disabled={busyAnywhere}
                        onClick={() => setSubmitting(sub.id)}
                      >
                        {busy && pending ? "Opening payment…" : momoAvailable ? "Pay by card" : "Renew Online"}
                      </button>
                    </form>
                  </>
                ) : (
                  <a className="button whatsapp" href={whatsapp} target="_blank" rel="noopener">
                    Renew on WhatsApp
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {dialog}
    </>
  );
}
