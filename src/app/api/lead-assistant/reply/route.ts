import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  analyzeLeadConversation,
  packageForClient,
  safeFollowUpDate,
  type AssistantPackage,
} from "@/lib/lead-assistant";

const replyInputSchema = z.object({
  leadId: z.string().min(1),
  customerMessage: z.string().trim().min(1, "Paste the customer's latest message."),
});

const interactionSpeaker: Record<string, string> = {
  "whatsapp-in": "Customer",
  "whatsapp-out": "Madar Hub (sent)",
  "ai-draft": "Madar Hub (AI draft; use as context but do not assume it was sent)",
  "whatsapp-transcript": "Earlier pasted WhatsApp transcript",
};

const protectedPaidStatuses = new Set(["Paid Day Pass", "Paid Monthly", "Active Member", "Paid"]);

function changedFields(
  lead: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  return Object.entries(next)
    .filter(([key, value]) => value !== undefined && value !== lead[key])
    .map(([key]) => key);
}

export async function POST(request: Request) {
  try {
    const input = replyInputSchema.parse(await request.json());
    const db = getDb();
    const [lead, packageRows] = await Promise.all([
      db.lead.findUnique({
        where: { id: input.leadId },
        include: {
          suggestedPackage: { select: { slug: true, name: true } },
          interactions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 },
        },
      }),
      db.package.findMany({
        where: { active: true, slug: { not: null } },
        orderBy: [{ price: "asc" }, { name: "asc" }],
        select: { id: true, slug: true, name: true, price: true, billingType: true, description: true },
      }),
    ]);
    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    const packages = packageRows.map((pkg) => ({ ...pkg, slug: pkg.slug! })) satisfies AssistantPackage[];
    const history = lead.interactions
      .slice()
      .reverse()
      .filter((item) => interactionSpeaker[item.type])
      .map((item) => `${interactionSpeaker[item.type]}:\n${item.content}`)
      .join("\n\n");
    const conversation = [history, `Customer (new message):\n${input.customerMessage}`]
      .filter(Boolean)
      .join("\n\n---\n\n");
    const existingLeadContext = [
      `Name: ${lead.name || "Unknown"}`,
      `Phone: ${lead.phone}`,
      `Lead type: ${lead.leadType || "Unknown"}`,
      `Interest: ${lead.interest || "Unknown"}`,
      `Status: ${lead.status}`,
      `Suggested package slug: ${lead.suggestedPackage?.slug || "None"}`,
      `Suggested package: ${lead.suggestedPackage?.name || "None"}`,
      `Language: ${lead.language || "Unknown"}`,
      `Budget: ${lead.budgetMentioned || "Unknown"}`,
      `People: ${lead.numberOfPeople ?? "Unknown"}`,
      `Requested date: ${lead.requestedDate || "Unknown"}`,
      `Requested time: ${lead.requestedTime || "Unknown"}`,
      `Equipment: ${lead.equipmentRequest || "None"}`,
      `Visit intent: ${lead.visitIntent}`,
      `Payment intent: ${lead.paymentIntent}`,
      `Location request: ${lead.locationRequest}`,
      `Staff notes: ${lead.notes || "None"}`,
      `Important lead facts: ${lead.importantNotes || "None"}`,
      `Prior AI summary: ${lead.aiSummary || "None"}`,
    ].join("\n");

    const result = await analyzeLeadConversation({ conversation, packages, existingLeadContext });
    const suggestedPackage = result.suggestedPackageSlug
      ? packages.find((pkg) => pkg.slug === result.suggestedPackageSlug)
      : lead.suggestedPackage
        ? packages.find((pkg) => pkg.slug === lead.suggestedPackage?.slug)
        : null;
    const nextStatus = protectedPaidStatuses.has(lead.status) ? lead.status : result.leadStatus;
    const updateData = {
      name: result.customerName || lead.name,
      phone: result.phone || lead.phone,
      leadType: result.leadType === "Unknown" && lead.leadType ? lead.leadType : result.leadType,
      interest: result.interest || lead.interest,
      status: nextStatus,
      suggestedPackageId: suggestedPackage?.id || lead.suggestedPackageId,
      language: result.languageDetected || lead.language,
      budgetMentioned: result.budgetMentioned || lead.budgetMentioned,
      numberOfPeople: result.numberOfPeople == null ? lead.numberOfPeople : Math.round(result.numberOfPeople),
      requestedDate: result.requestedDate || lead.requestedDate,
      requestedTime: result.requestedTime || lead.requestedTime,
      equipmentRequest: result.equipmentRequest || lead.equipmentRequest,
      importantNotes: result.importantNotes || lead.importantNotes,
      nextAction: result.nextAction,
      lastCustomerMessage: result.latestMessage || input.customerMessage,
      visitIntent: result.visitIntent || lead.visitIntent,
      paymentIntent: result.paymentIntent || lead.paymentIntent,
      locationRequest: result.locationRequest || lead.locationRequest,
      aiSummary: result.conversationSummary,
      aiConfidence: result.confidenceScore,
      followUpDate: safeFollowUpDate(result.followUpDate) || lead.followUpDate,
    };
    const updatedFields = changedFields(lead as unknown as Record<string, unknown>, updateData);

    await db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: lead.id }, data: updateData });
      await tx.interaction.createMany({
        data: [
          { leadId: lead.id, type: "whatsapp-in", content: input.customerMessage },
          { leadId: lead.id, type: "ai-draft", content: result.suggestedReply },
          {
            leadId: lead.id,
            type: "ai-analysis",
            content: `Updated ${updatedFields.length ? updatedFields.join(", ") : "conversation context"}. Next action: ${result.nextAction}`,
          },
        ],
      });
    });

    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/follow-ups");
    revalidatePath(`/leads/${lead.id}`);

    return NextResponse.json({
      success: true,
      data: result,
      packages: packages.map(packageForClient),
      updatedFields,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const zodError = error as Error & { issues: unknown[] };
      return NextResponse.json(
        { success: false, error: "Validation failed", details: zodError.issues },
        { status: 400 },
      );
    }
    console.error("[lead-assistant/reply] Error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate reply" },
      { status: 500 },
    );
  }
}
