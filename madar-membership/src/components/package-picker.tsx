"use client";

import { useActionState, useState } from "react";
import { startCheckout, type CheckoutState } from "@/app/checkout-actions";
import { PACKAGE_COPY } from "@/lib/package-copy";
import { WHATSAPP_NUMBER } from "@/lib/site";
import { checkoutAmounts } from "@/lib/pricing";
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

/**
 * The package cards from the public pricing page, rendered for a member who is
 * already signed in.
 *
 * The markup deliberately reuses the marketing site's own classes
 * (.pricing-card, .package-benefits, .pricing-card-footer), which are already
 * loaded from assets/styles.css — so these are the same cards, not a copy that
 * can drift.
 *
 * The one difference is what "Pay Online" does. On the public page it opens a
 * form asking for name, email and phone; here the member is known, so the
 * button posts only the package and goes straight to Pesapal.
 */
export function PackagePicker({
  packages,
  currentSlug,
}: {
  packages: PickerPackage[];
  currentSlug?: string | null;
}) {
  const [state, formAction, pending] = useActionState(startCheckout, initialState);
  const [submitting, setSubmitting] = useState<string | null>(null);

  if (packages.length === 0) {
    return <p className="mp-empty">No packages are available for online payment right now.</p>;
  }

  return (
    <>
      {state.error ? (
        <p className="mp-alert error" role="alert" style={{ marginBottom: 18 }}>
          {state.error}
        </p>
      ) : null}

      <div className="card-grid three pricing-cards-desktop">
        {packages.map((pkg) => {
          const copy = PACKAGE_COPY[pkg.slug];
          const isCurrent = pkg.slug === currentSlug;
          const busy = pending && submitting === pkg.slug;
          const whatsapp = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            `Hello Madar Hub, I want to subscribe to ${pkg.name}`,
          )}`;

          return (
            <article className={`pricing-card${isCurrent ? " featured" : ""}`} key={pkg.slug}>
              <span className="pricing-type">{copy?.kind ?? "Package"}</span>
              <h3>{pkg.name}</h3>
              <div className="pricing-price">
                <div className="price">
                  {pkg.price.toLocaleString("en-RW")}{" "}
                  <span>{CADENCE[pkg.billingType] ?? "RWF + VAT"}</span>
                </div>
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
                {/* One form per card: the member supplies only the package, and
                    their identity comes from the session on the server. */}
                <form action={formAction}>
                  <input type="hidden" name="packageSlug" value={pkg.slug} />
                  <button
                    type="submit"
                    className="button pesapal"
                    disabled={pending}
                    onClick={() => setSubmitting(pkg.slug)}
                  >
                    {busy ? "Opening payment…" : isCurrent ? "Renew Online" : "Pay Online"}
                  </button>
                </form>
                <a className="button whatsapp" href={whatsapp} target="_blank" rel="noopener">
                  Subscribe on WhatsApp
                </a>
              </div>

              <p className="mp-plan-total">
                {formatRwf(checkoutAmounts(pkg.price).chargedAmount)} charged at checkout
              </p>
            </article>
          );
        })}
      </div>

      <p className="mp-hint" style={{ marginTop: 18 }}>
        The amount charged includes 18% VAT and Pesapal&rsquo;s 3% online payment fee. You pay
        securely on Pesapal &mdash; we never see your card or mobile money details, and your saved
        details are filled in for you.
      </p>
    </>
  );
}
