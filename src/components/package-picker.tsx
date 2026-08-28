"use client";

import { useActionState, useState } from "react";
import { startCheckout, type CheckoutState } from "@/app/checkout-actions";
import { checkoutAmounts } from "@/lib/pricing";
import { formatRwf } from "@/lib/utils";
import { siteUrl } from "@/lib/site";

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

const KIND: Record<string, string> = {
  monthly: "Monthly membership",
  daily: "Day pass",
  hourly: "Room booking",
};

/**
 * Every description ends by restating that the price excludes VAT. The card
 * already shows the exact amount that will be charged, VAT and fee included,
 * so repeating it here is noise that pushes the useful detail out of view.
 */
function cleanDescription(description: string | null): string | null {
  if (!description) return null;
  return description.replace(/\s*Price excludes 18% VAT\.?\s*$/i, "").trim() || null;
}

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

  // Ten detailed cards in one undifferentiated grid is a wall. Members are
  // usually here to renew a monthly plan, so those come first, the way the
  // pricing page separates them.
  const monthly = packages.filter((p) => p.billingType === "monthly");
  const oneOff = packages.filter((p) => p.billingType !== "monthly");

  const renderGroup = (group: PickerPackage[], heading: string) =>
    group.length === 0 ? null : (
      <div className="mp-plan-group" key={heading}>
        <h3 className="mp-plan-group-title">{heading}</h3>
        <div className="mp-plans" role="radiogroup" aria-label={heading}>
          {group.map((pkg) => {
            const { chargedAmount } = checkoutAmounts(pkg.price);
            const isCurrent = pkg.slug === currentSlug;
            const isSelected = pkg.slug === selected;
            const detail = cleanDescription(pkg.description);
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
                  <span className="mp-plan-kind">{KIND[pkg.billingType] ?? "Package"}</span>
                  <span className="mp-plan-head">
                    <span className="mp-plan-name">{pkg.name}</span>
                    {isCurrent ? <span className="mp-plan-tag">Your plan</span> : null}
                  </span>
                  <span className="mp-plan-price">
                    {formatRwf(pkg.price)}{" "}
                    <span className="mp-plan-cadence">{CADENCE[pkg.billingType] ?? ""}</span>
                  </span>
                  {detail ? <span className="mp-plan-detail">{detail}</span> : null}
                  <span className="mp-plan-total">{formatRwf(chargedAmount)} charged at checkout</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );

  return (
    <form action={formAction}>
      {state.error ? (
        <p className="mp-alert error" role="alert" style={{ marginBottom: 16 }}>
          {state.error}
        </p>
      ) : null}

      {renderGroup(monthly, "Monthly memberships")}
      {renderGroup(oneOff, "Day passes and rooms")}

      <div className="mp-plan-actions">
        <button className="button primary mp-plan-submit" type="submit" disabled={pending || !selected}>
          {pending ? "Taking you to payment…" : (renewLabel ?? "Continue to payment")}
        </button>
        <a className="mp-plan-more" href={siteUrl("pricing.html")} target="_blank" rel="noreferrer">
          See full pricing details
        </a>
      </div>

      <p className="mp-hint" style={{ marginTop: 14 }}>
        Prices exclude VAT. The amount charged includes 18% VAT and Pesapal&rsquo;s 3% online payment
        fee. You pay securely on Pesapal &mdash; we never see your card or mobile money details.
      </p>
    </form>
  );
}
