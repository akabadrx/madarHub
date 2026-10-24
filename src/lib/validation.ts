import { z } from "zod";
import { INTERESTS, LEAD_SOURCES, PAYMENT_METHODS, VISIT_STATUSES } from "./constants";
import { INVOICE_PAYMENT_METHODS, PURCHASE_CATEGORIES, type InvoicePaymentMethod } from "./tax";

const optionalDate = z.union([z.string(), z.date(), z.null()]).optional().transform((value) => value ? new Date(value) : null);

export const leadSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().min(7, "Phone number is required"),
  email: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),
  source: z.enum(LEAD_SOURCES),
  interest: z.enum(INTERESTS).optional().or(z.literal("")),
  suggestedPackageId: z.string().optional(),
  status: z.string().min(1),
  visitDate: optionalDate,
  followUpDate: optionalDate,
  paymentStatus: z.string().optional(),
  amountPaid: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(5000).optional(),
  rawWhatsappSnippet: z.string().max(10000).optional(),
  aiSummary: z.string().max(2000).optional(),
  aiConfidence: z.coerce.number().min(0).max(1).optional(),
});

export const paymentSchema = z.object({
  leadId: z.string().min(1),
  packageId: z.string().optional(),
  // A subscription id, "new" to open another, or empty to let the server
  // decide (a person's only subscription, or their first).
  subscriptionId: z.string().optional(),
  subscriptionLabel: z.string().trim().max(100).optional(),
  amount: z.coerce.number().int().positive("Amount must be greater than zero"),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentDate: z.union([z.string().min(1), z.date()]).transform((value) => new Date(value)),
  notes: z.string().max(2000).optional(),
});

export const visitSchema = z.object({
  leadId: z.string().min(1),
  visitDate: z.union([z.string().min(1), z.date()]).transform((value) => new Date(value)),
  status: z.enum(VISIT_STATUSES),
  notes: z.string().max(2000).optional(),
});

export const subscriptionSchema = z.object({
  id: z.string().optional(),
  leadId: z.string().min(1),
  label: z.string().trim().max(100).optional(),
  packageId: z.string().optional(),
  startDate: optionalDate,
  notes: z.string().trim().max(2000).optional(),
});

// Empty for a buyer or supplier without a TIN; otherwise RRA's nine digits.
const tin = z.string().optional().transform((value) => (value || "").replace(/[\s-]/g, "")).refine((value) => value === "" || /^\d{9}$/.test(value), "A TIN is nine digits");
const day = z.union([z.string().min(1, "Date is required"), z.date()]).transform((value) => new Date(value));

export const invoiceSchema = z.object({
  leadId: z.string().optional(),
  paymentId: z.string().optional(),
  packageId: z.string().optional(),
  buyerTin: tin,
  buyerName: z.string().trim().max(200).optional(),
  buyerPhone: z.string().trim().min(7, "Buyer phone is required").max(30),
  itemName: z.string().trim().min(2, "Describe what was sold").max(200),
  quantity: z.coerce.number().int().min(1).max(1000),
  unitPrice: z.coerce.number().int().positive("Price must be greater than zero"),
  paymentMethod: z.enum(INVOICE_PAYMENT_METHODS.map((method) => method.value) as [InvoicePaymentMethod, ...InvoicePaymentMethod[]], { errorMap: () => ({ message: "Choose how the buyer paid" }) }),
  paymentDate: day,
  paymentReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const invoiceReceiptSchema = z.object({
  id: z.string().min(1),
  receiptNumber: z.string().trim().min(1, "Receipt number is required").max(50),
  sdcId: z.string().trim().min(1, "SDC ID is required").max(50),
  receiptDate: day,
});

export const purchaseSchema = z.object({
  id: z.string().optional(),
  supplierTin: tin,
  supplierName: z.string().trim().min(2, "Supplier name is required").max(200),
  description: z.string().trim().max(500).optional(),
  category: z.enum(PURCHASE_CATEGORIES),
  purchaseDate: day,
  receiptNumber: z.string().trim().max(50).optional(),
  sdcId: z.string().trim().max(50).optional(),
  // Receipts carry cents; anything finer is rounded away.
  totalAmount: z.coerce.number().positive("Total must be greater than zero").transform((value) => Math.round(value * 100) / 100),
  vatAmount: z.coerce.number().min(0).transform((value) => Math.round(value * 100) / 100),
  notes: z.string().trim().max(2000).optional(),
}).refine((data) => data.vatAmount < data.totalAmount, { message: "VAT must be less than the total", path: ["vatAmount"] });
