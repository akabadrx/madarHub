const VAT_INCLUSIVE_PERCENT = 118;

/**
 * Package payments are recorded with 18% VAT included, so revenue reporting
 * removes that tax. Unassigned payments are custom amounts entered as net
 * revenue already and must not be adjusted again.
 */
export function netRevenueAmount(
  amount: number,
  packageId: string | null | undefined,
) {
  return packageId
    ? Math.round((amount * 100) / VAT_INCLUSIVE_PERCENT)
    : amount;
}
