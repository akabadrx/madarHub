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
  previousAnalysis,
  followUpDate,
}: {
  conversation: string;
  packages: AssistantPackage[];
  existingLeadContext?: string;
  previousAnalysis?: AnalyzeOutput;
  followUpDate?: string | null;
}) {
  if (packages.length === 0) {
    throw new Error("No active CRM packages are configured");
  }

  const validSlugs = new Set(packages.map((pkg) => pkg.slug));
  const userMessage = [
    existingLeadContext ? `EXISTING CRM PROFILE:\n${existingLeadContext}` : null,
    previousAnalysis ? `PREVIOUS ANALYSIS TO PRESERVE OR CORRECT:\n${JSON.stringify(previousAnalysis)}` : null,
    followUpDate ? `STAFF-SELECTED FOLLOW-UP DATE:\n${followUpDate}` : null,
    `FULL CONVERSATION IN CHRONOLOGICAL ORDER:\n${conversation}`,
  ].filter(Boolean).join("\n\n---\n\n");

  const parsed = await callClaudeJson({
    system: buildLeadAssistantPrompt(packages),
    userMessage,
    temperature: aiConfig.temperature,
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
