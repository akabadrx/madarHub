"use client";

import { useActionState, useState } from "react";
import { startCheckout, type CheckoutState } from "@/app/checkout-actions";
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
  monthly: "per month",
  daily: "per day",
  hourly: "per session",
};

function cadence(billingType: string): string {
  return CADENCE[billingType] ?? "";
}

/**
 * One-tap checkout for a signed-in member. Only the package slug is submitted;
 * the server fills in who they are, so there is nothing to retype.
 */
export function PackagePicker({
  packages,
  currentSlug,
  renewLabel,
}: {
  packages: PickerPackage[];
  currentSlug?: string | null;
  renewLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(startCheckout, initialState);
  const [selected, setSelected] = useState<string | null>(currentSlug ?? null);

  if (packages.length === 0) {
    return <p className="mp-empty">No packages are available for online payment right now.</p>;
  }

  return (
    <form action={formAction}>
      {state.error ? (
        <p className="mp-alert error" role="alert" style={{ marginBottom: 16 }}>
          {state.error}
        </p>
      ) : null}

      <div className="mp-plans" role="radiogroup" aria-label="Choose a package">
        {packages.map((pkg) => {
          const { chargedAmount } = checkoutAmounts(pkg.price);
          const isCurrent = pkg.slug === currentSlug;
          const isSelected = pkg.slug === selected;
          return (
            <label
              key={pkg.slug}
              className={`mp-plan${isSelected ? " is-selected" : ""}`}
              htmlFor={`pkg-${pkg.slug}`}
            >
              <input
                type="radio"
                id={`pkg-${pkg.slug}`}
                name="packageSlug"
                value={pkg.slug}
                checked={isSelected}
                onChange={() => setSelected(pkg.slug)}
              />
              <span className="mp-plan-body">
                <span className="mp-plan-head">
                  <span className="mp-plan-name">{pkg.name}</span>
                  {isCurrent ? <span className="mp-plan-tag">Your plan</span> : null}
                </span>
                <span className="mp-plan-price">
                  {formatRwf(pkg.price)} <span className="mp-plan-cadence">{cadence(pkg.billingType)}</span>
                </span>
                <span className="mp-plan-total">{formatRwf(chargedAmount)} charged at checkout</span>
              </span>
            </label>
          );
        })}
      </div>

      <button className="button primary mp-plan-submit" type="submit" disabled={pending || !selected}>
        {pending ? "Taking you to payment…" : (renewLabel ?? "Continue to payment")}
      </button>

      <p className="mp-hint" style={{ marginTop: 12 }}>
        Prices exclude VAT. The amount charged includes 18% VAT and Pesapal&rsquo;s 3% online payment fee.
        You pay securely on Pesapal &mdash; we never see your card or mobile money details.
      </p>
    </form>
  );
}
