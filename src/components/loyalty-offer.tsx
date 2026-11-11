"use client";

import { useActionState, useState } from "react";
import { acceptTerms, type CheckoutState } from "@/app/checkout-actions";
import { PACKAGE_COPY } from "@/lib/package-copy";
import { addPesapalFee } from "@/lib/pricing";
import { formatRwf } from "@/lib/utils";

const initialState: CheckoutState = {};

function Terms({ text }: { text: string }) {
  return (
    <div className="mp-terms">
      {text.split("\n\n").map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

/** The required tick box and the button it unlocks, posting to acceptTerms. */
function AgreeForm({
  subscriptionId,
  termsVersion,
  packageSlug,
  pay,
  label,
  agreeText,
}: {
  subscriptionId: string;
  termsVersion: string;
  packageSlug?: string;
  pay: boolean;
  label: string;
  agreeText: string;
}) {
  const [state, formAction, pending] = useActionState(acceptTerms, initialState);
  const [agreed, setAgreed] = useState(false);
  return (
    <form action={formAction} className="mp-agree">
      {state.error ? (
        <p className="mp-alert error" role="alert">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="termsVersion" value={termsVersion} />
      {packageSlug ? <input type="hidden" name="packageSlug" value={packageSlug} /> : null}
      <input type="hidden" name="pay" value={pay ? "1" : "0"} />
      <label className="mp-agree-check">
        <input type="checkbox" name="agree" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{agreeText}</span>
      </label>
      <button type="submit" className="button pesapal" disabled={!agreed || pending}>
        {pending ? "Please wait…" : label}
      </button>
    </form>
  );
}

/**
 * The Loyalty Rate card. Rendered only when the CRM says this member
 * qualifies; the CRM checks again when they accept, so hiding the card is not
 * the only thing standing between a member and the price.
 *
 * A member who is due pays the first Loyalty month at once. One who is paid up
 * switches from their next due date, so they keep the month already paid for.
 */
export function LoyaltyOffer({
  offer,
}: {
  offer: {
    subscriptionId: string;
    packageSlug: string;
    standardTotal: number;
    monthlyTotal: number;
    commitmentMonths: number;
    terms: string;
    termsVersion: string;
    startsOnText: string;
    dueNow: boolean;
  };
}) {
  const copy = PACKAGE_COPY["virtual-business-address"];
  // This offer's copy never names the hub's street address.
  const benefits = (copy?.benefits ?? []).filter((b) => !/KG 42|Kimironko/i.test(b));

  return (
    <div className="card-grid three">
      <article className="pricing-card featured">
        <span className="badge">Member offer</span>
        <span className="pricing-type">Member offer · {offer.commitmentMonths}-month commitment</span>
        <h3>Virtual Address / Business Address Support — Loyalty Rate</h3>
        <div className="pricing-price">
          <div className="price">
            {offer.monthlyTotal.toLocaleString("en-RW")} <span>RWF / month, VAT inclusive</span>
          </div>
          <span className="capacity">
            <s>{offer.standardTotal.toLocaleString("en-RW")} RWF</s> standard monthly price
          </span>
        </div>

        {copy?.tagline ? <p className="pricing-tagline">{copy.tagline}</p> : null}
        <ul className="package-benefits">
          {benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>

        <details className="pricing-more">
          <summary>Full package details</summary>
          <div className="pricing-more-content">
            {copy && copy.moreBenefits.length > 0 ? (
              <ul className="package-benefits">
                {copy.moreBenefits.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
            ) : null}
            <Terms text={offer.terms} />
          </div>
        </details>

        <div className="pricing-card-footer">
          <AgreeForm
            subscriptionId={offer.subscriptionId}
            termsVersion={offer.termsVersion}
            packageSlug={offer.packageSlug}
            pay={offer.dueNow}
            label={offer.dueNow ? "Pay Online" : `Switch at my next payment (${offer.startsOnText})`}
            agreeText={`I have read and agree to the ${offer.commitmentMonths}-month commitment and early-termination terms.`}
          />
        </div>

        <p className="mp-plan-total">
          {formatRwf(addPesapalFee(offer.monthlyTotal))} charged at checkout
          {offer.dueNow ? "" : `, from ${offer.startsOnText}`}
        </p>
      </article>
    </div>
  );
}

/** New terms staff set on a member's plan, to accept before the next payment. */
export function TermsToAccept({
  subscriptionId,
  name,
  monthlyTotal,
  commitmentMonths,
  terms,
  termsVersion,
}: {
  subscriptionId: string;
  name: string;
  monthlyTotal: number;
  commitmentMonths: number;
  terms: string;
  termsVersion: string;
}) {
  return (
    <div className="mp-due">
      <p>
        <strong>{name}</strong> now costs <strong>{formatRwf(monthlyTotal)}</strong> a month, VAT inclusive, with a{" "}
        {commitmentMonths}-month commitment. Please read and accept the terms before your next payment.
      </p>
      <Terms text={terms} />
      <AgreeForm
        subscriptionId={subscriptionId}
        termsVersion={termsVersion}
        pay={false}
        label="Accept terms"
        agreeText={`I have read and agree to the ${commitmentMonths}-month commitment and early-termination terms.`}
      />
    </div>
  );
}
