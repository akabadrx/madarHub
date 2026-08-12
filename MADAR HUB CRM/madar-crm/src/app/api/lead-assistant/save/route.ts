import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { analyzeOutputSchema } from "@/lib/lead-assistant-validation";
import { safeFollowUpDate } from "@/lib/lead-assistant";

const conversationTurnSchema = z.object({
  role: z.enum(["customer", "assistant"]),
  content: z.string().trim().min(1).max(10000),
});

const saveLeadSchema = z.object({
  analysis: analyzeOutputSchema,
  initialTranscript: z.string().trim().min(10).max(100000),
  fullTranscript: z.string().trim().min(10).max(150000),
  conversationTurns: z.array(conversationTurnSchema).max(100).default([]),
});

export async function POST(request: Request) {
  try {
    const data = saveLeadSchema.parse(await request.json());
    if (!data.analysis.phone || data.analysis.phone.trim().length < 7) {
      return NextResponse.json(
        { success: false, error: "Phone number is required to save the lead" },
        { status: 400 },
      );
    }

    const db = getDb();
    const suggestedPackage = data.analysis.suggestedPackageSlug
      ? await db.package.findUnique({ where: { slug: data.analysis.suggestedPackageSlug } })
      : null;
    const lead = await db.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          name: data.analysis.customerName || null,
          phone: data.analysis.phone!,
          source: "WhatsApp Direct",
          interest: data.analysis.interest,
          status: data.analysis.leadStatus,
          suggestedPackageId: suggestedPackage?.id || null,
          importantNotes: data.analysis.importantNotes,
          rawWhatsappSnippet: data.fullTranscript,
          aiSummary: data.analysis.conversationSummary,
          aiConfidence: data.analysis.confidenceScore,
          followUpDate: safeFollowUpDate(data.analysis.followUpDate),
          leadType: data.analysis.leadType,
          language: data.analysis.languageDetected,
          budgetMentioned: data.analysis.budgetMentioned,
          numberOfPeople: data.analysis.numberOfPeople == null ? null : Math.round(data.analysis.numberOfPeople),
          requestedDate: data.analysis.requestedDate,
          requestedTime: data.analysis.requestedTime,
          equipmentRequest: data.analysis.equipmentRequest,
          nextAction: data.analysis.nextAction,
          lastCustomerMessage: data.analysis.latestMessage,
          visitIntent: data.analysis.visitIntent,
          paymentIntent: data.analysis.paymentIntent,
          locationRequest: data.analysis.locationRequest,
        },
      });
      await tx.interaction.createMany({
        data: [
          { leadId: created.id, type: "lead", content: "Lead created via WhatsApp Lead Assistant" },
          { leadId: created.id, type: "whatsapp-transcript", content: data.initialTranscript },
          ...data.conversationTurns.map((turn) => ({
            leadId: created.id,
            type: turn.role === "customer" ? "whatsapp-in" : "whatsapp-out",
            content: turn.content,
          })),
          { leadId: created.id, type: "ai-draft", content: data.analysis.suggestedReply },
          { leadId: created.id, type: "ai-follow-up", content: data.analysis.followUpMessage },
          {
            leadId: created.id,
            type: "ai-analysis",
            content: `${data.analysis.conversationSummary}\nNext action: ${data.analysis.nextAction}`,
          },
        ],
      });
      return created;
    });

    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/follow-ups");
    revalidatePath(`/leads/${lead.id}`);
    return NextResponse.json({ success: true, id: lead.id });
  } catch (error) {
    console.error("[lead-assistant/save] Error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save lead" },
      { status: 500 },
    );
  }
}
