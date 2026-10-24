/**
 * Rwanda tax rules the invoice and finance pages share: VAT maths, the
 * payment types EBM asks for, and the quarter/year periods returns are filed
 * for. Rates and deadlines live here and nowhere else.
 */

/** Standard VAT rate in Rwanda, EBM tax type B. */
export const VAT_RATE_PERCENT = 18;

/**
 * Corporate income tax rate used for the annual estimate only. The return
 * itself is worked out on RRA e-Tax; this is a planning figure.
 */
export const CIT_RATE_PERCENT = 28;

/** Rounds to the cent, the precision EBM and the VAT annex use. */
export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A stored amount (a Prisma Decimal) as a plain number of francs. */
export function amount(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

/** The VAT inside a VAT-inclusive amount: 18/118 of it, to the cent as EBM computes it. */
export function vatFromInclusive(totalInclusive: number): number {
  return cents((totalInclusive * VAT_RATE_PERCENT) / (100 + VAT_RATE_PERCENT));
}

/**
 * How the buyer paid, as the invoice records it, and the payment type to pick
 * in EBM. Pesapal settles to the bank account, so it is a bank transfer.
 * Check `ebm` against the payment types your EBM version lists and adjust
 * here if they differ.
 */
export const INVOICE_PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank slip / transfer (incl. Pesapal)", ebm: "OTHER (bank transfer)" },
  { value: "mobile_money", label: "Mobile transfer (MoMo)", ebm: "MOBILE MONEY" },
  { value: "bank_cheque", label: "Bank cheque deposit", ebm: "BANK CHECK" },
] as const;

export type InvoicePaymentMethod = (typeof INVOICE_PAYMENT_METHODS)[number]["value"];

export function invoicePaymentMethod(value: string) {
  return INVOICE_PAYMENT_METHODS.find((method) => method.value === value);
}

/** The invoice payment type implied by how a CRM payment was recorded. */
export function invoiceMethodForPayment(paymentMethod: string): InvoicePaymentMethod | "" {
  if (paymentMethod === "MoMo Pay") return "mobile_money";
  if (paymentMethod === "Pesapal" || paymentMethod === "Bank Transfer") return "bank_transfer";
  return "";
}

export const INVOICE_STATUSES = ["draft", "issued", "void"] as const;

/**
 * Purchase categories. Equipment is capital: it is depreciated over several
 * years rather than deducted in the year it is bought, so the annual estimate
 * keeps it out of expenses.
 */
export const PURCHASE_CATEGORIES = [
  "Rent", "Utilities (power & water)", "Internet & phone", "Coffee & kitchen supplies",
  "Cleaning & maintenance", "Office supplies", "Marketing & ads", "Professional services",
  "Software & subscriptions", "Bank & payment fees", "Transport", "Salaries & wages", "Equipment & furniture (capital)", "Other",
] as const;

export const CAPITAL_CATEGORY = "Equipment & furniture (capital)";

/** Input VAT counts only with an EBM receipt from a VAT-registered supplier. */
export function isInputVatClaimable(purchase: { supplierTin: string | null; receiptNumber: string | null; sdcId: string | null; vatAmount: { toNumber(): number } | number }) {
  return Boolean(purchase.supplierTin && purchase.receiptNumber && purchase.sdcId && amount(purchase.vatAmount) > 0);
}

/**
 * A filing period. Dates are stored at UTC midnight (they come from date
 * inputs), so periods are UTC day ranges: [start, end).
 */
export type TaxPeriod = { year: number; quarter: number | null; start: Date; end: Date; label: string };

export function quarterPeriod(year: number, quarter: number): TaxPeriod {
  const startMonth = (quarter - 1) * 3;
  return {
    year, quarter,
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 1)),
    label: `Q${quarter} ${year}`,
  };
}

export function yearPeriod(year: number): TaxPeriod {
  return { year, quarter: null, start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)), label: `${year}` };
}

export function quarterOf(date: Date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

/** VAT returns are declared and paid by the 15th of the month after the period. */
export function vatDueDate(period: TaxPeriod) {
  return new Date(Date.UTC(period.end.getUTCFullYear(), period.end.getUTCMonth(), 15));
}

/** The annual income tax return is due by 31 March of the following year. */
export function incomeTaxDueDate(year: number) {
  return new Date(Date.UTC(year + 1, 2, 31));
}

/** "YYYY-MM-DD" for a stored UTC-midnight date, for CSVs and date inputs. */
export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" for a moment in time, as the day it was in Kigali. */
export function kigaliDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Reads ?year=&q= into a period, defaulting to the current quarter. */
export function periodFromParams(params: { year?: string; q?: string }, now = new Date()): TaxPeriod {
  const year = Number(params.year) || now.getUTCFullYear();
  if (params.q === "year") return yearPeriod(year);
  const quarter = Number(params.q);
  return quarterPeriod(year, quarter >= 1 && quarter <= 4 ? quarter : quarterOf(now));
}

/** RRA TINs are nine digits. Spaces and dashes are dropped before checking. */
export function cleanTin(value: string | null | undefined) {
  const digits = (value || "").replace(/[\s-]/g, "");
  return digits || null;
}
