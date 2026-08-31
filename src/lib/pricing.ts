/**
 * Checkout pricing, shared by the public website checkout and the member
 * portal checkout so the two can never drift. This is money maths: change it
 * in one place only.
 */

const VAT_MULTIPLIER_PERCENT = 118;

/**
 * Pesapal's 3% transaction charge, passed on to the customer rather than
 * absorbed by Madar Hub. A 118,000 RWF sale is billed as 121,540.
 *
 * This is a surcharge on the sale price, not a gross-up of it: Pesapal still
 * takes its 3% of the larger figure, so settlement lands slightly under the
 * sale price rather than exactly on it. Netting the full sale price would mean
 * dividing by 0.97 instead of multiplying by 1.03.
 */
const PESAPAL_FEE_PERCENT = 3;

/** VAT-inclusive sale price: what settles to the bank and what the CRM books. */
export function saleAmountWithVat(packagePrice: number): number {
  return Math.round((packagePrice * VAT_MULTIPLIER_PERCENT) / 100);
}

/** What Pesapal bills: the sale price plus Pesapal's surcharge. */
export function addPesapalFee(saleAmount: number): number {
  return Math.round((saleAmount * (100 + PESAPAL_FEE_PERCENT)) / 100);
}

/** Both figures for a package price, for display and for the order request. */
export function checkoutAmounts(packagePrice: number) {
  const amount = saleAmountWithVat(packagePrice);
  return { amount, chargedAmount: addPesapalFee(amount) };
}

/**
 * MoMo bills the customer directly, so there is no Pesapal 3% to pass on: the
 * charged amount is the VAT-inclusive sale price itself. The pair is still
 * returned so both channels have the same shape and the same `amount` books to
 * the CRM either way.
 */
export function momoCheckoutAmounts(packagePrice: number) {
  const amount = saleAmountWithVat(packagePrice);
  return { amount, chargedAmount: amount };
}
