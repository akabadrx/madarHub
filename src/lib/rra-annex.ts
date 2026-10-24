import { cents, cleanTin } from "@/lib/tax";

/**
 * RRA's VAT annex files (Sales_Ver_1.1.txt, Purchase_Ver_1.1.txt): the lists
 * of sales and purchases uploaded with a VAT declaration on e-Tax. One line
 * per receipt, fields separated by "|", CRLF line endings:
 *
 *   Sales     No|Buyer TIN|Buyer name|Description|SDC ID/Receipt no|dd/mm/yyyy|
 *             Taxable amount|Exempt|Zero-rated|Exports|Total excl. VAT|VAT
 *   Purchases No|Supplier TIN|Supplier name|Description|SDC ID/Receipt no|dd/mm/yyyy|
 *             Amount excl. VAT|VAT
 *
 * Amounts are plain numbers with up to two decimals. A buyer without a TIN is
 * written as 999999999.
 */

export const NO_TIN = "999999999";

const SALES_COLUMNS = 12;
const PURCHASE_COLUMNS = 8;

export type AnnexSale = { line: number; buyerTin: string | null; buyerName: string; description: string; sdcId: string; receiptNumber: string; date: Date; netAmount: number; vatAmount: number };
export type AnnexPurchase = { line: number; supplierTin: string | null; supplierName: string; description: string; sdcId: string; receiptNumber: string; date: Date; netAmount: number; vatAmount: number };
export type ParsedAnnex =
  | { kind: "sales"; rows: AnnexSale[]; errors: string[] }
  | { kind: "purchases"; rows: AnnexPurchase[]; errors: string[] }
  | { kind: "unknown"; rows: []; errors: string[] };

function parseDate(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 ? date : null;
}

function parseAmount(value: string): number | null {
  const text = value.trim().replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(text) ? cents(Number(text)) : null;
}

/** "SDC010206195/7" → the SDC ID and the receipt number after the slash. */
function parseReceipt(value: string) {
  const [sdcId, ...rest] = value.trim().split("/");
  const receiptNumber = rest.join("/").trim();
  return sdcId && receiptNumber ? { sdcId: sdcId.trim(), receiptNumber } : null;
}

/** Reads an annex file, telling sales from purchases by its column count. */
export function parseAnnex(text: string): ParsedAnnex {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((line, index) => ({ cells: line.split("|"), line: index + 1 })).filter(({ cells }) => cells.join("").trim() !== "");
  if (lines.length === 0) return { kind: "unknown", rows: [], errors: ["The file is empty."] };
  const columns = lines[0].cells.length;
  if (columns !== SALES_COLUMNS && columns !== PURCHASE_COLUMNS) {
    return { kind: "unknown", rows: [], errors: [`Expected ${SALES_COLUMNS} columns (sales annex) or ${PURCHASE_COLUMNS} (purchases annex), found ${columns}.`] };
  }
  const errors: string[] = [];
  const common = (cells: string[], line: number) => {
    const receipt = parseReceipt(cells[4]);
    const date = parseDate(cells[5]);
    if (!receipt) errors.push(`Line ${line}: "${cells[4]}" is not an SDC ID/receipt number.`);
    if (!date) errors.push(`Line ${line}: "${cells[5]}" is not a dd/mm/yyyy date.`);
    const tin = cleanTin(cells[1]);
    return receipt && date ? { line, tin: tin === NO_TIN ? null : tin, name: cells[2].trim(), description: cells[3].trim(), ...receipt, date } : null;
  };

  if (columns === SALES_COLUMNS) {
    const rows: AnnexSale[] = [];
    for (const { cells, line } of lines) {
      if (cells.length !== SALES_COLUMNS) { errors.push(`Line ${line}: expected ${SALES_COLUMNS} columns, found ${cells.length}.`); continue; }
      const base = common(cells, line);
      const [exempt, zeroRated, exports, net, vat] = cells.slice(7).map(parseAmount);
      if (net === null || vat === null) { errors.push(`Line ${line}: the amounts are not numbers.`); continue; }
      // Madar Hub only makes standard-rated sales; anything else needs a look
      // rather than a silent import.
      if (exempt || zeroRated || exports) { errors.push(`Line ${line}: has exempt, zero-rated or export amounts, which this import does not handle.`); continue; }
      if (base) rows.push({ line, buyerTin: base.tin, buyerName: base.name, description: base.description, sdcId: base.sdcId, receiptNumber: base.receiptNumber, date: base.date, netAmount: net, vatAmount: vat });
    }
    return { kind: "sales", rows, errors };
  }

  const rows: AnnexPurchase[] = [];
  for (const { cells, line } of lines) {
    if (cells.length !== PURCHASE_COLUMNS) { errors.push(`Line ${line}: expected ${PURCHASE_COLUMNS} columns, found ${cells.length}.`); continue; }
    const base = common(cells, line);
    const [net, vat] = cells.slice(6).map(parseAmount);
    if (net === null || vat === null) { errors.push(`Line ${line}: the amounts are not numbers.`); continue; }
    if (base) rows.push({ line, supplierTin: base.tin, supplierName: base.name, description: base.description, sdcId: base.sdcId, receiptNumber: base.receiptNumber, date: base.date, netAmount: net, vatAmount: vat });
  }
  return { kind: "purchases", rows, errors };
}

function annexText(value: string | null | undefined) {
  return (value || "").replace(/[|\r\n]+/g, " ").trim();
}

/** 500000 → "500000", 4237.29 → "4237.29", as RRA's own files write them. */
function annexAmount(value: number) {
  return String(cents(value));
}

function annexDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function annexFile(lines: (string | number)[][]) {
  return lines.map((cells) => cells.join("|")).join("\r\n") + (lines.length ? "\r\n" : "");
}

type Receipted = { sdcId: string | null; receiptNumber: string | null };
const receiptRef = (row: Receipted) => `${annexText(row.sdcId)}/${annexText(row.receiptNumber)}`;

export function salesAnnex(rows: (Receipted & { buyerTin: string | null; buyerName: string | null; itemName: string; receiptDate: Date; netAmount: number; vatAmount: number })[]) {
  return annexFile(rows.map((row, index) => [index + 1, row.buyerTin || NO_TIN, annexText(row.buyerName), annexText(row.itemName), receiptRef(row), annexDate(row.receiptDate), annexAmount(row.netAmount), 0, 0, 0, annexAmount(row.netAmount), annexAmount(row.vatAmount)]));
}

/** Only purchases whose input VAT is claimable belong on the purchases annex. */
export function purchasesAnnex(rows: (Receipted & { supplierTin: string | null; supplierName: string; description: string | null; category: string; purchaseDate: Date; netAmount: number; vatAmount: number })[]) {
  return annexFile(rows.map((row, index) => [index + 1, annexText(row.supplierTin), annexText(row.supplierName), annexText(row.description || row.category), receiptRef(row), annexDate(row.purchaseDate), annexAmount(row.netAmount), annexAmount(row.vatAmount)]));
}
