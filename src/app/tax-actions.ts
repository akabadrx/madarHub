"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { parseAnnex } from "@/lib/rra-annex";
import { cents, PURCHASE_CATEGORIES, vatFromInclusive } from "@/lib/tax";
import { invoiceReceiptSchema, invoiceSchema, purchaseSchema } from "@/lib/validation";

function refreshFinance() {
  ["/invoices", "/purchases", "/tax"].forEach((path) => revalidatePath(path));
}

function optional(value: string | undefined) {
  return value ? value : null;
}

/** Saves a draft invoice and opens its EBM sheet. */
export async function createInvoice(input: unknown): Promise<{ error?: string }> {
  const data = invoiceSchema.parse(input);
  const db = getDb();
  if (data.paymentId) {
    const existing = await db.invoice.findUnique({ where: { paymentId: data.paymentId }, select: { id: true } });
    if (existing) return { error: "That payment already has an invoice." };
  }
  const totalAmount = cents(data.unitPrice * data.quantity);
  const invoice = await db.invoice.create({
    data: {
      leadId: optional(data.leadId),
      paymentId: optional(data.paymentId),
      packageId: optional(data.packageId),
      buyerTin: optional(data.buyerTin),
      buyerName: optional(data.buyerName),
      buyerPhone: data.buyerPhone,
      itemName: data.itemName,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      totalAmount,
      vatAmount: vatFromInclusive(totalAmount),
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate,
      paymentReference: optional(data.paymentReference),
      notes: optional(data.notes),
    },
  });
  if (invoice.leadId) {
    await db.interaction.create({ data: { leadId: invoice.leadId, type: "payment", content: `EBM invoice drafted: ${totalAmount.toLocaleString()} RWF for ${invoice.itemName}` } });
  }
  refreshFinance();
  redirect(`/invoices/${invoice.id}`);
}

/** Records the receipt EBM printed, which makes the invoice part of the sales ledger. */
export async function recordInvoiceReceipt(formData: FormData) {
  const data = invoiceReceiptSchema.parse(Object.fromEntries(formData));
  const db = getDb();
  try {
    const invoice = await db.invoice.update({
      where: { id: data.id },
      data: { receiptNumber: data.receiptNumber, sdcId: data.sdcId, receiptDate: data.receiptDate, status: "issued" },
    });
    if (invoice.leadId) {
      await db.interaction.create({ data: { leadId: invoice.leadId, type: "payment", content: `EBM invoice issued: receipt ${data.receiptNumber} (SDC ${data.sdcId})` } });
      revalidatePath(`/leads/${invoice.leadId}`);
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/invoices/${data.id}?error=duplicate`);
    }
    throw error;
  }
  refreshFinance();
  revalidatePath(`/invoices/${data.id}`);
}

/**
 * Cancels an invoice. An issued one stays on file, marked void and left out
 * of every total; EBM needs its own refund receipt to cancel it there.
 */
export async function voidInvoice(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const reason = z.string().trim().max(500).parse(formData.get("reason") ?? "");
  const db = getDb();
  const invoice = await db.invoice.findUnique({ where: { id }, select: { status: true } });
  if (!invoice) throw new Error("Invoice not found");
  // A draft never reached EBM, so there is nothing to keep.
  if (invoice.status === "draft") {
    await db.invoice.delete({ where: { id } });
    refreshFinance();
    redirect("/invoices");
  }
  // Freeing the payment lets it be invoiced again, correctly this time.
  await db.invoice.update({ where: { id }, data: { status: "void", voidReason: reason || null, paymentId: null } });
  refreshFinance();
  revalidatePath(`/invoices/${id}`);
}

export async function savePurchase(input: unknown): Promise<{ error?: string }> {
  const data = purchaseSchema.parse(input);
  const payload = {
    supplierTin: optional(data.supplierTin),
    supplierName: data.supplierName,
    description: optional(data.description),
    category: data.category,
    purchaseDate: data.purchaseDate,
    receiptNumber: optional(data.receiptNumber),
    sdcId: optional(data.sdcId),
    totalAmount: data.totalAmount,
    vatAmount: data.vatAmount,
    notes: optional(data.notes),
  };
  const db = getDb();
  if (data.id) await db.purchase.update({ where: { id: data.id }, data: payload });
  else await db.purchase.create({ data: payload });
  refreshFinance();
  return {};
}

export async function deletePurchase(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  await getDb().purchase.delete({ where: { id } });
  refreshFinance();
}

export async function setPurchaseCategory(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const category = z.enum(PURCHASE_CATEGORIES).parse(formData.get("category"));
  await getDb().purchase.update({ where: { id }, data: { category } });
  refreshFinance();
}

export type AnnexImportResult = { ok: boolean; message: string; errors: string[] };

/**
 * Loads a sales or purchases annex already filed on RRA e-Tax into the
 * ledgers, so past quarters sit beside the ones filed from here. Receipts
 * already on file (same SDC ID and receipt number) are skipped, so importing
 * the same file twice changes nothing.
 */
export async function importAnnex(_previous: AnnexImportResult | null, formData: FormData): Promise<AnnexImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an annex file to import.", errors: [] };
  const parsed = parseAnnex(await file.text());
  if (parsed.kind === "unknown") return { ok: false, message: "That does not look like an RRA VAT annex.", errors: parsed.errors };
  if (parsed.errors.length) return { ok: false, message: "Nothing was imported. Fix these lines and try again.", errors: parsed.errors };

  const db = getDb();
  const key = (row: { sdcId: string | null; receiptNumber: string | null }) => `${row.sdcId}/${row.receiptNumber}`;
  let imported = 0;
  if (parsed.kind === "sales") {
    const result = await db.invoice.createMany({
      skipDuplicates: true,
      data: parsed.rows.map((row) => {
        const total = cents(row.netAmount + row.vatAmount);
        return { buyerTin: row.buyerTin, buyerName: row.buyerName || null, itemName: row.description || "Sale", quantity: 1, unitPrice: total, totalAmount: total, vatAmount: row.vatAmount, status: "issued", receiptNumber: row.receiptNumber, sdcId: row.sdcId, receiptDate: row.date, notes: `Imported from ${file.name}` };
      }),
    });
    imported = result.count;
  } else {
    const existing = new Set((await db.purchase.findMany({ where: { sdcId: { in: parsed.rows.map((row) => row.sdcId) } }, select: { sdcId: true, receiptNumber: true } })).map(key));
    const fresh = parsed.rows.filter((row) => !existing.has(key(row)));
    const result = await db.purchase.createMany({
      data: fresh.map((row) => ({ supplierTin: row.supplierTin, supplierName: row.supplierName || "Unknown supplier", description: row.description || null, category: "Other", purchaseDate: row.date, receiptNumber: row.receiptNumber, sdcId: row.sdcId, totalAmount: cents(row.netAmount + row.vatAmount), vatAmount: row.vatAmount, notes: `Imported from ${file.name}` })),
    });
    imported = result.count;
  }
  refreshFinance();
  const skipped = parsed.rows.length - imported;
  const what = parsed.kind === "sales" ? "sales" : "purchases";
  return { ok: true, message: `Imported ${imported} ${what}${skipped ? `; ${skipped} already on file were skipped` : ""}.${parsed.kind === "purchases" && imported ? " They are filed under Other: set each one's category on the Purchases page for the yearly return." : ""}`, errors: [] };
}
