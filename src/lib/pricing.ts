/**
 * Display-side mirror of the CRM's src/lib/pricing.ts. The CRM remains the
 * authority: it recalculates both figures when it creates the Pesapal order,
 * so nothing here can change what a member is actually charged. These exist
 * only so the dashboard can show the same numbers before they click through.
 *
 * Keep in step with the CRM copy.
 */

const VAT_MULTIPLIER_PERCENT = 118;
const PESAPAL_FEE_PERCENT = 3;

/** VAT-inclusive sale price. */
export function saleAmountWithVat(packagePrice: number): number {
  return Math.round((packagePrice * VAT_MULTIPLIER_PERCENT) / 100);
}

/** What Pesapal will bill: the sale price plus Pesapal's 3% surcharge. */
export function addPesapalFee(saleAmount: number): number {
  return Math.round((saleAmount * (100 + PESAPAL_FEE_PERCENT)) / 100);
}

export function checkoutAmounts(packagePrice: number) {
  const amount = saleAmountWithVat(packagePrice);
  return { amount, chargedAmount: addPesapalFee(amount) };
}

/**
 * MoMo bills the member directly, so there is no Pesapal 3% to pass on: the
 * charged amount is the VAT-inclusive sale price itself.
 */
export function momoCheckoutAmounts(packagePrice: number) {
  const amount = saleAmountWithVat(packagePrice);
  return { amount, chargedAmount: amount };
}
