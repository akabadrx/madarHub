import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOYALTY,
  commitmentProgress,
  describeBilling,
  earlyTerminationPenalty,
  loyaltyEligibility,
  loyaltyTerms,
  overrideApplies,
  priceForCheckout,
  termsVersion,
  type OverrideTerms,
} from "@/lib/billing";

const VA = "pkg-va";
const STANDARD = 118_000;
const d = (iso: string) => new Date(`${iso}T09:00:00Z`);
const pay = (iso: string, amount = STANDARD, packageId = VA) => ({ paymentDate: d(iso), amount, packageId });

const loyalty = (overrides: Partial<OverrideTerms> = {}): OverrideTerms => ({
  kind: "loyalty",
  amount: 85_000,
  vatInclusive: true,
  effectiveFrom: d("2026-01-01"),
  commitmentMonths: 12,
  terms: "t",
  termsVersion: "v1",
  note: null,
  createdAt: d("2026-01-01"),
  ...overrides,
});

const eligible = (payments: ReturnType<typeof pay>[], now = d("2026-03-10"), extra = {}) =>
  loyaltyEligibility({
    subscriptionStatus: "active",
    packageId: VA,
    loyaltyPackageId: VA,
    standardTotal: STANDARD,
    hasOverride: false,
    unpaidPenalty: false,
    payments,
    now,
    ...extra,
  }).eligible;

test("eligibility needs two payments", () => {
  assert.equal(eligible([]), false);
  assert.equal(eligible([pay("2026-03-01")]), false);
  assert.equal(eligible([pay("2026-02-01"), pay("2026-03-01")]), true);
});

test("eligibility needs consecutive months", () => {
  // 30 Jan then 2 Mar: inside the first month's grace period, so no lapse.
  assert.equal(eligible([pay("2026-01-30"), pay("2026-03-02")]), true);
  // A month skipped.
  assert.equal(eligible([pay("2026-01-01"), pay("2026-03-01")]), false);
  // The same period booked twice is not two months.
  assert.equal(eligible([pay("2026-03-01"), pay("2026-03-03")]), false);
});

test("eligibility refuses a lapsed or unqualified plan", () => {
  // Last paid 1 Mar: due 1 Apr, suspended after 8 Apr.
  assert.equal(eligible([pay("2026-02-01"), pay("2026-03-01")], d("2026-04-05")), true);
  assert.equal(eligible([pay("2026-02-01"), pay("2026-03-01")], d("2026-04-10")), false);
  assert.equal(eligible([pay("2026-02-01"), pay("2026-03-01")], d("2026-03-10"), { subscriptionStatus: "cancelled" }), false);
  assert.equal(eligible([pay("2026-02-01"), pay("2026-03-01")], d("2026-03-10"), { hasOverride: true }), false);
  assert.equal(eligible([pay("2026-02-01"), pay("2026-03-01")], d("2026-03-10"), { unpaidPenalty: true }), false);
  // Paid at a different price or for a different plan.
  assert.equal(eligible([pay("2026-02-01", 85_000), pay("2026-03-01")]), false);
  assert.equal(eligible([pay("2026-02-01", STANDARD, "pkg-desk"), pay("2026-03-01")]), false);
});

test("penalty at 0, 4, 11 and 12 Loyalty months", () => {
  const o = loyalty();
  assert.equal(earlyTerminationPenalty(o, STANDARD, 0), 0);
  assert.equal(earlyTerminationPenalty(o, STANDARD, 4), 132_000);
  assert.equal(earlyTerminationPenalty(o, STANDARD, 11), 363_000);
  assert.equal(earlyTerminationPenalty(o, STANDARD, 12), 0);
});

test("penalty with a custom override, and with no commitment", () => {
  assert.equal(earlyTerminationPenalty(loyalty({ kind: "custom", amount: 100_000, commitmentMonths: 6 }), STANDARD, 3), 54_000);
  // VAT-exclusive amount: 80,000 + VAT = 94,400.
  assert.equal(earlyTerminationPenalty(loyalty({ amount: 80_000, vatInclusive: false, commitmentMonths: 6 }), STANDARD, 2), 47_200);
  assert.equal(earlyTerminationPenalty(loyalty({ commitmentMonths: null }), STANDARD, 4), 0);
});

test("only months paid at the override price count toward the commitment", () => {
  const o = loyalty({ createdAt: d("2026-03-05"), effectiveFrom: d("2026-04-01") });
  const progress = commitmentProgress(o, [pay("2026-02-01"), pay("2026-03-01"), pay("2026-04-01", 85_000), pay("2026-05-01", 85_000)]);
  assert.equal(progress.monthsPaid, 2);
  assert.deepEqual(progress.startDate, d("2026-04-01"));
  assert.deepEqual(progress.endDate, d("2027-04-01"));
});

test("an override applies from the next cycle and every cycle after", () => {
  const o = loyalty({ effectiveFrom: d("2026-04-01") });
  // Paid up until 1 Apr: the cycle being paid for is the one starting then.
  assert.equal(overrideApplies(o, d("2026-04-01"), false, d("2026-03-20")), true);
  // Every later cycle too.
  assert.equal(overrideApplies(o, d("2026-09-01"), false, d("2026-08-25")), true);
  // A cycle that started before the effective date keeps the old price.
  assert.equal(overrideApplies(o, d("2026-03-01"), false, d("2026-03-05")), false);
});

test("an override sets the amount due; without it the standard price returns", () => {
  const sub = { id: "s", status: "active", packageId: VA, package: { price: 100_000, billingType: "monthly" } };
  const payments = [pay("2026-03-01")];
  const now = d("2026-04-03");
  const withOverride = describeBilling({ ...sub, priceOverride: loyalty({ effectiveFrom: d("2026-04-01"), commitmentMonths: null }) }, payments, [], now);
  assert.equal(withOverride.info?.dueAmount, 85_000);
  const removed = describeBilling({ ...sub, priceOverride: null }, payments, [], now);
  assert.equal(removed.info?.dueAmount, 100_000);
});

test("checkout price comes from the server's records only", () => {
  const pkg = { id: VA, price: 100_000 };
  const sub = { id: "s", status: "active", packageId: VA, package: { price: 100_000, billingType: "monthly" } };
  const now = d("2026-04-03");
  const billing = (o: OverrideTerms | null, accepted: string[] = []) => ({
    subscriptionId: "s",
    packageId: VA,
    ...describeBilling({ ...sub, priceOverride: o }, [pay("2026-03-01")], accepted, now),
  });

  // No override: the standard VAT-inclusive price, whatever anyone asks for.
  assert.deepEqual(priceForCheckout(pkg, billing(null)), { saleAmount: STANDARD, subscriptionId: null });
  // A committed price cannot be paid until its terms are accepted.
  assert.ok("error" in priceForCheckout(pkg, billing(loyalty())));
  assert.deepEqual(priceForCheckout(pkg, billing(loyalty(), ["v1"])), { saleAmount: 85_000, subscriptionId: "s" });
  // The override belongs to its plan: buying another package pays that package's price.
  assert.deepEqual(priceForCheckout({ id: "pkg-desk", price: 100_000 }, billing(loyalty(), ["v1"])), { saleAmount: STANDARD, subscriptionId: null });
});

test("loyalty terms state the worked example and change version when edited", () => {
  const terms = loyaltyTerms(STANDARD);
  assert.match(terms, /33,000 RWF \(118,000 − 85,000\)/);
  assert.match(terms, /ending after 4 months means 132,000 RWF/);
  assert.doesNotMatch(terms, /KG 42|Kimironko/);
  assert.notEqual(termsVersion(terms), termsVersion(`${terms} `));
  assert.equal(LOYALTY.monthlyTotal, 85_000);
});
