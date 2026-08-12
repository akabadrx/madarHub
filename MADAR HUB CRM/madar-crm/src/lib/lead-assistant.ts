import { aiConfig, buildLeadAssistantPrompt } from "@/lib/ai-config";
import { callClaudeJson } from "@/lib/anthropic";
import {
  analyzeOutputSchema,
  LEAD_STATUS_ENUMS,
  LEAD_TYPE_ENUMS,
  type AnalyzeOutput,
} from "@/lib/lead-assistant-validation";

export interface AssistantPackage {
  id: string;
  slug: string;
  name: string;
  price: number;
  billingType: string;
  description: string | null;
}

export const packageForClient = (pkg: AssistantPackage) => ({
  id: pkg.id,
  slug: pkg.slug,
  name: pkg.name,
  price: pkg.price,
  billingType: pkg.billingType,
  description: pkg.description,
});

const clipMemoryText = (value: string | null | undefined, maxLength = 4000) => {
  if (!value) return null;
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
};

function previousAnalysisMemory(previous: AnalyzeOutput) {
  return {
    conversationSummary: clipMemoryText(previous.conversationSummary, 6000),
    customerName: previous.customerName,
    phone: previous.phone,
    latestCustomerMessage: clipMemoryText(previous.latestMessage, 1200),
    language: previous.languageDetected,
    leadType: previous.leadType,
    leadStatus: previous.leadStatus,
    interest: previous.interest,
    suggestedPackageSlug: previous.suggestedPackageSlug,
    suggestedPackageReason: clipMemoryText(previous.suggestedPackageReason, 1200),
    budgetMentioned: previous.budgetMentioned,
    numberOfPeople: previous.numberOfPeople,
    requestedDate: previous.requestedDate,
    requestedTime: previous.requestedTime,
    visitIntent: previous.visitIntent,
    paymentIntent: previous.paymentIntent,
    locationRequest: previous.locationRequest,
    equipmentRequest: previous.equipmentRequest,
    importantNotes: clipMemoryText(previous.importantNotes, 2000),
    unresolvedInformation: previous.missingInformation.slice(0, 10),
    nextAction: clipMemoryText(previous.nextAction, 1200),
    followUpDate: previous.followUpDate,
  };
}

function outputJsonSchema(packages: AssistantPackage[]) {
  return {
    type: "object",
    properties: {
      customerName: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      latestMessage: { type: ["string", "null"] },
      languageDetected: { type: "string" },
      leadType: { type: "string", enum: LEAD_TYPE_ENUMS },
      leadStatus: { type: "string", enum: LEAD_STATUS_ENUMS },
      interest: { type: ["string", "null"] },
      suggestedPackageSlug: {
        anyOf: [
          { type: "string", enum: packages.map((pkg) => pkg.slug) },
          { type: "null" },
        ],
      },
      suggestedPackageReason: { type: ["string", "null"] },
      budgetMentioned: { type: ["string", "null"] },
      numberOfPeople: { type: ["number", "null"] },
      requestedDate: { type: ["string", "null"] },
      requestedTime: { type: ["string", "null"] },
      visitIntent: { type: "boolean" },
      paymentIntent: { type: "boolean" },
      locationRequest: { type: "boolean" },
      equipmentRequest: { type: ["string", "null"] },
      importantNotes: { type: ["string", "null"] },
      conversationSummary: { type: "string" },
      missingInformation: { type: "array", items: { type: "string" } },
      nextAction: { type: "string" },
      followUpDate: { type: ["string", "null"] },
      suggestedReply: { type: "string" },
      followUpMessage: { type: "string" },
      confidenceScore: { type: "number" },
    },
    required: [
      "customerName", "phone", "latestMessage", "languageDetected", "leadType", "leadStatus",
      "interest", "suggestedPackageSlug", "suggestedPackageReason", "budgetMentioned",
      "numberOfPeople", "requestedDate", "requestedTime", "visitIntent", "paymentIntent",
      "locationRequest", "equipmentRequest", "importantNotes", "conversationSummary",
      "missingInformation", "nextAction", "followUpDate", "suggestedReply", "followUpMessage",
      "confidenceScore",
    ],
    additionalProperties: false,
  } as const;
}

export async function analyzeLeadConversation({
  conversation,
  packages,
  existingLeadContext,
  rollingSummary,
  previousAnalysis,
  followUpDate,
}: {
  conversation: string;
  packages: AssistantPackage[];
  existingLeadContext?: string;
  rollingSummary?: string | null;
  previousAnalysis?: AnalyzeOutput;
  followUpDate?: string | null;
}) {
  if (packages.length === 0) {
    throw new Error("No active CRM packages are configured");
  }

  const validSlugs = new Set(packages.map((pkg) => pkg.slug));
  const compactMemory = previousAnalysis
    ? JSON.stringify(previousAnalysisMemory(previousAnalysis))
    : clipMemoryText(rollingSummary, 6000);
  const isIncremental = Boolean(compactMemory || existingLeadContext);
  const userMessage = [
    existingLeadContext ? `EXISTING CRM PROFILE:\n${existingLeadContext}` : null,
    compactMemory ? `ROLLING CONVERSATION MEMORY — PRESERVE OR CORRECT:\n${compactMemory}` : null,
    followUpDate ? `STAFF-SELECTED FOLLOW-UP DATE:\n${followUpDate}` : null,
    `${isIncremental ? "NEW UNSUMMARIZED TURN(S) ONLY" : "INITIAL TRANSCRIPT IN CHRONOLOGICAL ORDER"}:\n${conversation}`,
  ].filter(Boolean).join("\n\n---\n\n");

  const parsed = await callClaudeJson({
    system: buildLeadAssistantPrompt(packages),
    userMessage,
    maxTokens: aiConfig.maxTokens,
    jsonSchema: outputJsonSchema(packages),
  });
  const result = analyzeOutputSchema.parse(parsed);

  if (result.suggestedPackageSlug && !validSlugs.has(result.suggestedPackageSlug)) {
    return {
      ...result,
      suggestedPackageSlug: null,
      suggestedPackageReason: "The recommendation did not match an active CRM package and needs staff review.",
    };
  }
  return result;
}

export function safeFollowUpDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
