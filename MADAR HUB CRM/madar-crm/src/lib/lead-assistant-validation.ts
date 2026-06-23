import { z } from "zod";

export const analyzeInputSchema = z.object({
  chat: z.string().trim().min(10, "Paste at least 10 characters of the WhatsApp conversation."),
  saveSnippet: z.boolean().optional().default(false),
  followUpDate: z.string().nullable().optional(),
});

export const LEAD_TYPE_ENUMS = [
  "General Coworking Lead", "Day Pass Lead", "Monthly Fixed Desk Lead",
  "Student Study Lead", "Meeting Room Lead", "Training Room Lead",
  "Private Office Lead", "Team Room Lead", "Location Request",
  "Equipment Question", "Follow Up Later", "Low Intent", "Unknown",
] as const;

export const LEAD_STATUS_ENUMS = [
  "New Lead", "Hot Lead", "Asked Price", "Visit Scheduled",
  "Follow Up Later", "Training Room Lead", "Private Office Lead",
  "Monthly Lead", "Day Pass Lead", "Student Lead", "Active Member", "Paid", "Lost",
] as const;

export const analyzeOutputSchema = z.object({
  customerName: z.string().nullable(),
  phone: z.string().nullable(),
  latestMessage: z.string().nullable(),
  languageDetected: z.string(),
  leadType: z.enum(LEAD_TYPE_ENUMS),
  leadStatus: z.enum(LEAD_STATUS_ENUMS),
  interest: z.string().nullable(),
  suggestedPackage: z.string().nullable(),
  budgetMentioned: z.string().nullable(),
  numberOfPeople: z.number().nullable(),
  requestedDate: z.string().nullable(),
  requestedTime: z.string().nullable(),
  visitIntent: z.boolean(),
  paymentIntent: z.boolean(),
  locationRequest: z.boolean(),
  equipmentRequest: z.string().nullable(),
  importantNotes: z.string().nullable(),
  nextAction: z.string(),
  followUpDate: z.string().nullable(),
  suggestedReply: z.string(),
  followUpMessage: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;
export type AnalyzeOutput = z.infer<typeof analyzeOutputSchema>;