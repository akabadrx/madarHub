"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { vatFromInclusive } from "@/lib/tax";
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
  const totalAmount = data.unitPrice * data.quantity;
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
