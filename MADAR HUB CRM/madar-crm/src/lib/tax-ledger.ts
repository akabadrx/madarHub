import { getDb } from "@/lib/db";
import { amount, CAPITAL_CATEGORY, cents, isInputVatClaimable, quarterOf, type TaxPeriod } from "@/lib/tax";

/**
 * The sales and purchase ledgers for one filing period, with the totals a
 * VAT return and an income tax return need. The /tax page and the CSV export
 * both read from here so the screen and the file always agree.
 *
 * Sales are issued invoices dated by their EBM receipt; void invoices and
 * drafts never count. Purchases are dated by their receipt.
 */
export async function loadLedger(period: TaxPeriod) {
  const db = getDb();
  const range = { gte: period.start, lt: period.end };
  const [invoices, purchases, uninvoicedPayments, drafts] = await Promise.all([
    db.invoice.findMany({ where: { status: "issued", receiptDate: range }, orderBy: [{ receiptDate: "asc" }, { receiptNumber: "asc" }] }),
    db.purchase.findMany({ where: { purchaseDate: range }, orderBy: { purchaseDate: "asc" } }),
    db.payment.count({ where: { paymentDate: range, invoice: { is: null } } }),
    db.invoice.count({ where: { status: "draft", paymentDate: range } }),
  ]);

  // Amounts become plain numbers here, once, so nothing downstream handles Decimals.
  const sales = invoices.map((invoice) => {
    const totalAmount = amount(invoice.totalAmount);
    const vatAmount = amount(invoice.vatAmount);
    return { ...invoice, unitPrice: amount(invoice.unitPrice), totalAmount, vatAmount, receiptDate: invoice.receiptDate!, netAmount: cents(totalAmount - vatAmount) };
  // Receipt numbers are text in the database; within a day they run 9, 10, 11.
  }).sort((a, b) => a.receiptDate.getTime() - b.receiptDate.getTime() || (parseInt(a.receiptNumber ?? "", 10) || 0) - (parseInt(b.receiptNumber ?? "", 10) || 0));
  const purchaseRows = purchases.map((purchase) => {
    const totalAmount = amount(purchase.totalAmount);
    const vatAmount = amount(purchase.vatAmount);
    const claimable = isInputVatClaimable(purchase);
    const netAmount = cents(totalAmount - vatAmount);
    // VAT that cannot be claimed back is simply part of what the thing cost.
    return { ...purchase, totalAmount, vatAmount, claimable, netAmount, expense: claimable ? netAmount : totalAmount };
  });

  const sum = <T,>(rows: T[], pick: (row: T) => number) => cents(rows.reduce((total, row) => total + pick(row), 0));
  const outputVat = sum(sales, (row) => row.vatAmount);
  const inputVat = sum(purchaseRows.filter((row) => row.claimable), (row) => row.vatAmount);
  const operating = purchaseRows.filter((row) => row.category !== CAPITAL_CATEGORY);

  return {
    sales,
    purchases: purchaseRows,
    uninvoicedPayments,
    drafts,
    unclaimableVatPurchases: purchaseRows.filter((row) => row.vatAmount > 0 && !row.claimable).length,
    totals: {
      salesNet: sum(sales, (row) => row.netAmount),
      salesGross: sum(sales, (row) => row.totalAmount),
      outputVat,
      purchasesNet: sum(purchaseRows, (row) => row.netAmount),
      purchasesGross: sum(purchaseRows, (row) => row.totalAmount),
      inputVat,
      vatPayable: cents(outputVat - inputVat),
      expenses: sum(operating, (row) => row.expense),
      capitalSpend: sum(purchaseRows.filter((row) => row.category === CAPITAL_CATEGORY), (row) => row.totalAmount),
    },
    byQuarter: [1, 2, 3, 4].map((quarter) => {
      const qs = sales.filter((row) => quarterOf(row.receiptDate) === quarter);
      const qp = purchaseRows.filter((row) => quarterOf(row.purchaseDate) === quarter);
      const qOutput = sum(qs, (row) => row.vatAmount);
      const qInput = sum(qp.filter((row) => row.claimable), (row) => row.vatAmount);
      return { quarter, salesNet: sum(qs, (row) => row.netAmount), outputVat: qOutput, purchasesNet: sum(qp, (row) => row.netAmount), inputVat: qInput, vatPayable: cents(qOutput - qInput) };
    }),
    byCategory: Object.entries(
      purchaseRows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.category]: cents((acc[row.category] || 0) + row.expense) }), {}),
    ).sort((a, b) => b[1] - a[1]),
  };
}

export type Ledger = Awaited<ReturnType<typeof loadLedger>>;
