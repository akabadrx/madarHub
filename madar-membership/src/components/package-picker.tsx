"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  checkMomoStatus,
  startCheckout,
  startMomoCheckout,
  type CheckoutState,
} from "@/app/checkout-actions";
import { PACKAGE_COPY, PACKAGE_ORDER } from "@/lib/package-copy";
import { MOMO_MERCHANT_NAME, MOMO_USSD, WHATSAPP_NUMBER, WHATSAPP_URL } from "@/lib/site";
import { checkoutAmounts, momoCheckoutAmounts } from "@/lib/pricing";
import { formatRwf } from "@/lib/utils";

const initialState: CheckoutState = {};

export type PickerPackage = {
  slug: string;
  name: string;
  price: number;
  billingType: string;
  description: string | null;
};

const CADENCE: Record<string, string> = {
  monthly: "RWF / month + VAT",
  daily: "RWF / day + VAT",
  hourly: "RWF + VAT",
};

// MoMo resolves on the member's handset, so the page waits for them to find
// their phone and type a PIN. MTN expires an unanswered prompt well inside this
// window; the ceiling only stops a wedged transaction spinning forever.
const POLL_INTERVAL_MS = 3000;
const POLL_CEILING_MS = 180000;

type MomoState =
  | { phase: "idle" }
  | { phase: "waiting"; reference: string; phone: string; amount: number; packageName: string }
  | { phase: "done"; packageName: string }
  | { phase: "error"; message: string };

/**
 * The package cards from the public pricing page, rendered for a member who is
 * already signed in.
 *
 * The markup deliberately reuses the marketing site's own classes
 * (.pricing-card, .package-benefits, .pricing-card-footer, .checkout-*), which
 * are already loaded from assets/styles.css — so these are the same cards and
 * the same payment dialog, not a copy that can drift.
 *
 * The difference from the public page is what the buttons do. There the member
 * is a stranger and has to type their details; here they are known, so both
 * buttons post only the package and identity comes from the session.
 */
export function PackagePicker({
  packages,
  currentSlug,
}: {
  packages: PickerPackage[];
  currentSlug?: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(startCheckout, initialState);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [momo, setMomo] = useState<MomoState>({ phase: "idle" });
  const [momoStarting, startMomo] = useTransition();
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // A member who navigates away mid-prompt must not leave a timer running: the
  // reconcile sweep in the CRM is what finishes the payment in that case.
  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (momo.phase !== "waiting") return;

    let cancelled = false;
    const deadline = Date.now() + POLL_CEILING_MS;
    const { reference, packageName } = momo;

    const tick = () => {
      pollRef.current = setTimeout(async () => {
        const result = await checkMomoStatus(reference);
        if (cancelled) return;

        if (result.status === "COMPLETED") {
          setMomo({ phase: "done", packageName });
          // The dashboard reads the member's plan and payment history on the
          // server, so it has to be re-fetched for the new payment to show.
          router.refresh();
          return;
        }

        if (result.status === "FAILED" || result.status === "ABANDONED") {
          setMomo({
            phase: "error",
            message: result.reason
              ? `The MoMo payment did not go through: ${result.reason}.`
              : "The MoMo payment was not completed. You can try again, or pay by card.",
          });
          return;
        }

        if (Date.now() >= deadline) {
          setMomo({
            phase: "error",
            message:
              "We haven't heard back from MTN yet. If you approved the payment it will still be recorded — check back in a few minutes or message us on WhatsApp.",
          });
          return;
        }

        tick();
      }, POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [momo, router, stopPolling]);

  if (packages.length === 0) {
    return <p className="mp-empty">No packages are available for online payment right now.</p>;
  }

  const rank = (slug: string) => {
    const i = PACKAGE_ORDER.indexOf(slug);
    return i === -1 ? PACKAGE_ORDER.length : i;
  };
  const ordered = [...packages].sort((a, b) => rank(a.slug) - rank(b.slug));

  const onMomoClick = (slug: string) => {
    setSubmitting(slug);
    startMomo(async () => {
      const result = await startMomoCheckout(slug);
      if ("error" in result) {
        setMomo({ phase: "error", message: result.error });
        return;
      }
      setMomo({ phase: "waiting", ...result });
    });
  };

  const busyAnywhere = pending || momoStarting || momo.phase === "waiting";

  return (
    <>
      {state.error ? (
        <p className="mp-alert error" role="alert" style={{ marginBottom: 18 }}>
          {state.error}
        </p>
      ) : null}

      <div className="card-grid three pricing-cards-desktop">
        {ordered.map((pkg) => {
          const copy = PACKAGE_COPY[pkg.slug];
          const isCurrent = pkg.slug === currentSlug;
          const busy = submitting === pkg.slug;
          const whatsapp = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            `Hello Madar Hub, I want to subscribe to ${pkg.name}`,
          )}`;

          return (
            <article
              className={`pricing-card${copy?.featured || isCurrent ? " featured" : ""}`}
              key={pkg.slug}
            >
              {isCurrent ? (
                <span className="badge">Your plan</span>
              ) : copy?.badge ? (
                <span className="badge">{copy.badge}</span>
              ) : null}
              <span className="pricing-type">{copy?.kind ?? "Package"}</span>
              <h3>{pkg.name}</h3>
              <div className="pricing-price">
                <div className="price">
                  {pkg.price.toLocaleString("en-RW")}{" "}
                  <span>{CADENCE[pkg.billingType] ?? "RWF + VAT"}</span>
                </div>
                {copy?.capacity ? <span className="capacity">{copy.capacity}</span> : null}
              </div>

              {copy?.tagline || pkg.description ? (
                <p className="pricing-tagline">{copy?.tagline || pkg.description}</p>
              ) : null}

              {copy && copy.benefits.length > 0 ? (
                <ul className="package-benefits">
                  {copy.benefits.map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                </ul>
              ) : null}

              {copy && (copy.moreBenefits.length > 0 || copy.bestFor) ? (
                <details className="pricing-more">
                  <summary>{copy.moreLabel}</summary>
                  <div className="pricing-more-content">
                    {copy.moreBenefits.length > 0 ? (
                      <ul className="package-benefits">
                        {copy.moreBenefits.map((benefit) => (
                          <li key={benefit}>{benefit}</li>
                        ))}
                      </ul>
                    ) : null}
                    {copy.bestFor ? (
                      <div className="best-for">
                        <strong>Best for</strong>
                        <span>{copy.bestFor}</span>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

              <div className="pricing-card-footer">
                {/* MoMo leads because it is the cheaper channel for the member
                    and the one most of them already use. */}
                <button
                  type="button"
                  className="button pesapal"
                  disabled={busyAnywhere}
                  onClick={() => onMomoClick(pkg.slug)}
                >
                  {busy && momoStarting
                    ? "Sending prompt…"
                    : isCurrent
                      ? "Renew with MoMo"
                      : "Pay with MoMo"}
                </button>

                {/* One form per card: the member supplies only the package, and
                    their identity comes from the session on the server. */}
                <form action={formAction}>
                  <input type="hidden" name="packageSlug" value={pkg.slug} />
                  <button
                    type="submit"
                    className="button outline"
                    disabled={busyAnywhere}
                    onClick={() => setSubmitting(pkg.slug)}
                  >
                    {busy && pending ? "Opening payment…" : "Pay by card"}
                  </button>
                </form>

                <a className="button whatsapp" href={whatsapp} target="_blank" rel="noopener">
                  Subscribe on WhatsApp
                </a>
              </div>

              <p className="mp-plan-total">
                {formatRwf(momoCheckoutAmounts(pkg.price).chargedAmount)} on MoMo &middot;{" "}
                {formatRwf(checkoutAmounts(pkg.price).chargedAmount)} by card
              </p>
            </article>
          );
        })}
      </div>

      <p className="mp-hint" style={{ marginTop: 18 }}>
        Both prices include 18% VAT. Paying with MTN MoMo costs nothing extra &mdash; you approve a
        prompt on your phone. Paying by card, bank or another mobile money network goes through
        Pesapal, which adds a 3% online payment fee; we never see your card details either way.
      </p>

      {momo.phase !== "idle" ? (
        <MomoDialog state={momo} onClose={() => setMomo({ phase: "idle" })} />
      ) : null}
    </>
  );
}

/**
 * The MoMo prompt dialog, sharing the marketing site's checkout modal styles so
 * a member sees the same thing whether they pay from the public pricing page or
 * from inside the portal.
 *
 * While waiting there is deliberately no close button: the payment is live on
 * the member's handset, and dismissing the dialog would suggest it had been
 * cancelled when it has not.
 */
function MomoDialog({ state, onClose }: { state: MomoState; onClose: () => void }) {
  const waiting = state.phase === "waiting";

  return (
    <div className="checkout-overlay">
      <div
        className="checkout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="momo-dialog-title"
      >
        {!waiting ? (
          <button type="button" className="checkout-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        ) : null}

        {state.phase === "waiting" ? (
          <>
            <div className="checkout-spinner" aria-hidden="true" />
            <h3 className="checkout-waiting-title" id="momo-dialog-title">
              Check your phone
            </h3>
            <p className="checkout-waiting-body">
              We sent a payment request to <strong>{state.phone}</strong>. Enter your MoMo PIN to
              approve <strong>{formatRwf(state.amount)}</strong> for {state.packageName}.
            </p>
            <p className="checkout-waiting-status" aria-live="polite">
              Waiting for your approval&hellip;
            </p>
            <p className="checkout-note">Keep this page open until the payment is confirmed.</p>
          </>
        ) : null}

        {state.phase === "done" ? (
          <>
            <h3 className="checkout-waiting-title" id="momo-dialog-title">
              Payment received
            </h3>
            <p className="checkout-waiting-body">
              Thank you — your {state.packageName} payment is confirmed and your membership is
              up to date.
            </p>
            <button type="button" className="button primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : null}

        {state.phase === "error" ? (
          <>
            <h3 className="checkout-waiting-title" id="momo-dialog-title">
              Payment not completed
            </h3>
            <p className="checkout-waiting-body">{state.message}</p>
            <p className="checkout-manual-momo">
              You can also pay by hand: dial <strong>{MOMO_USSD}</strong> and send the amount to{" "}
              {MOMO_MERCHANT_NAME}, then send us the confirmation on WhatsApp.
            </p>
            <div className="pricing-card-footer">
              <button type="button" className="button primary" onClick={onClose}>
                Try again
              </button>
              <a className="button whatsapp" href={WHATSAPP_URL} target="_blank" rel="noopener">
                Message us on WhatsApp
              </a>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
