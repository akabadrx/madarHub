import { z } from "zod";
import { INTERESTS, LEAD_SOURCES, PAYMENT_METHODS, VISIT_STATUSES } from "./constants";

const optionalDate = z.union([z.string(), z.date(), z.null()]).optional().transform((value) => value ? new Date(value) : null);

export const leadSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().min(7, "Phone number is required"),
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
