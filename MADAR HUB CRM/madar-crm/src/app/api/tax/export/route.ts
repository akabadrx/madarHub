import { NextResponse } from "next/server";
import { purchasesAnnex, salesAnnex } from "@/lib/rra-annex";
import { cents, invoicePaymentMethod, isoDay, periodFromParams } from "@/lib/tax";
import { loadLedger } from "@/lib/tax-ledger";

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows: (string | number | null | undefined)[][]) {
  // BOM so Excel opens the file as UTF-8.
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * The sales or purchases ledger for one period: `format=annex` gives the
 * pipe-separated file RRA e-Tax takes with the VAT declaration, otherwise a
 * CSV for a spreadsheet or an accountant.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const kind = params.kind === "purchases" ? "purchases" : "sales";
  const period = periodFromParams(params);
  const ledger = await loadLedger(period);
  const periodName = period.quarter ? `${period.year}-Q${period.quarter}` : `${period.year}`;

  if (params.format === "annex") {
    const body = kind === "sales" ? salesAnnex(ledger.sales) : purchasesAnnex(ledger.purchases.filter((row) => row.claimable));
    const filename = `${kind === "sales" ? "Sales" : "Purchase"}_Ver_1.1_${periodName}.txt`;
    return new NextResponse(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } });
  }

  const body = kind === "sales"
    ? csv([
      ["Receipt date", "Receipt number", "SDC ID", "Buyer TIN", "Buyer name", "Buyer phone", "Item", "Quantity", "Amount excl. VAT", "VAT", "Total incl. VAT", "Payment method", "Transfer date", "Transfer reference"],
      ...ledger.sales.map((row) => [isoDay(row.receiptDate), row.receiptNumber, row.sdcId, row.buyerTin, row.buyerName, row.buyerPhone, row.itemName, row.quantity, row.netAmount, row.vatAmount, row.totalAmount, row.paymentMethod ? invoicePaymentMethod(row.paymentMethod)?.label ?? row.paymentMethod : "", row.paymentDate ? isoDay(row.paymentDate) : "", row.paymentReference]),
      ["Total", "", "", "", "", "", "", "", ledger.totals.salesNet, ledger.totals.outputVat, ledger.totals.salesGross],
    ])
    : csv([
      ["Receipt date", "Receipt number", "SDC ID", "Supplier TIN", "Supplier name", "Category", "Description", "Amount excl. VAT", "VAT", "Total incl. VAT", "Input VAT claimable"],
      ...ledger.purchases.map((row) => [isoDay(row.purchaseDate), row.receiptNumber, row.sdcId, row.supplierTin, row.supplierName, row.category, row.description, row.netAmount, row.vatAmount, row.totalAmount, row.claimable ? "Yes" : "No"]),
      ["Total", "", "", "", "", "", "", ledger.totals.purchasesNet, cents(ledger.purchases.reduce((sum, row) => sum + row.vatAmount, 0)), ledger.totals.purchasesGross, ledger.totals.inputVat],
    ]);

  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="madar-hub-${kind}-${periodName}.csv"` } });
}
