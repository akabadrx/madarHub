import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { aiConfig, AI_SYSTEM_PROMPT } from "@/lib/ai-config";
import { z } from "zod";

const replyInputSchema = z.object({
  leadId: z.string().min(1),
  chat: z.string().trim().min(10, "Paste at least 10 characters of the conversation."),
  followUpDate: z.string().nullable().optional(),
});

const replyOutputSchema = z.object({
  suggestedReply: z.string(),
  followUpMessage: z.string(),
});

type ReplyOutput = z.infer<typeof replyOutputSchema>;

const CONTINUE_PROMPT = `You are a CRM assistant for Madar Hub in Kigali. A team member is continuing a WhatsApp conversation with an existing lead and needs your help drafting replies.

Below you'll receive:
1. Lead profile information (name, interest, status, package, notes, past interactions)
2. The NEW WhatsApp conversation that just happened

Your job:
1. Write the best next WhatsApp reply based on the full context
2. Write a follow-up message to send later (2-3 days from now) to check in

Reply guidelines:
- Reference the lead by name
- Be warm, professional, short, WhatsApp-friendly
- Sales-focused but not pushy
- Reference their specific interest/package
- Reference what was discussed in the new conversation
- End with one clear question

Follow-up message guidelines:
- Reference the lead's specific interest
- Nudge toward next step (visit, booking, payment)
- Don't include the date itself - the user will time it
- Keep it casual and friendly

Return STRICT JSON only:
{
  "suggestedReply": string,
  "followUpMessage": string
}`;

function buildMockReply(
  lead: { name: string | null; phone: string; interest: string | null; status: string; suggestedPackage?: { name: string } | null },
  chat: string
): ReplyOutput {
  const leadName = lead.name || "there";
  const lower = chat.toLowerCase();

  let suggestedReply = `Hi ${leadName}! Thanks for your message. How can I help?`;
  let followUpMessage = `Hi ${leadName}! Just checking in — is there anything else you needed regarding our coworking space? Let me know!`;

  if (lead.interest?.includes("Day Pass") || lower.includes("day pass")) {
    suggestedReply = `Hi ${leadName}! Yes, our Day Pass is 10,000 RWF with full access to the workspace. Would you like to come in today or tomorrow?`;
    followUpMessage = `Hi ${leadName}! Did you manage to visit Madar Hub? We'd love to host you. The Day Pass is ready whenever you are!`;
  } else if (lead.interest?.includes("Monthly") || lower.includes("monthly") || lower.includes("fixed desk")) {
    suggestedReply = `Hi ${leadName}! Great to hear from you again. Our monthly fixed desk is 100,000 RWF/month. Would you like to schedule a tour?`;
    followUpMessage = `Hi ${leadName}! Just following up on our chat about the monthly desk. Would this week work for a visit?`;
  } else if (lead.interest?.includes("Student") || lower.includes("study") || lower.includes("student")) {
    suggestedReply = `Hi ${leadName}! The student study pass is 3,000 RWF/day. Which day would you like to come?`;
    followUpMessage = `Hi ${leadName}! Checking in — did you find a good day to study at Madar Hub? Let me know and I'll reserve a spot for you.`;
  } else if (lead.interest?.includes("Meeting") || lower.includes("meeting")) {
    suggestedReply = `Hi ${leadName}! For the meeting room, it's 25,000 RWF (4hrs) or 30,000 RWF (8hrs). What date and number of people are you looking at?`;
    followUpMessage = `Hi ${leadName}! Have you finalized the date for your meeting? Let me know and I'll confirm availability.`;
  } else if (lead.interest?.includes("Private") || lower.includes("private")) {
    suggestedReply = `Hi ${leadName}! Thanks for reaching out again. Would you like to schedule a tour of our private team room?`;
    followUpMessage = `Hi ${leadName}! Following up — would you like to visit and see the private team room in person?`;
  } else if (lower.includes("price") || lower.includes("how much") || lower.includes("cost")) {
    suggestedReply = `Hi ${leadName}! Here are our prices: Day Pass 10K RWF, Monthly Desk 100K RWF, Student Pass 3K RWF. What interests you most?`;
    followUpMessage = `Hi ${leadName}! Did you have a chance to look at the pricing? Let me know which option works best for you!`;
  } else if (lower.includes("visit") || lower.includes("come") || lower.includes("location")) {
    suggestedReply = `Hi ${leadName}! We're at KG 42 Street, Kimironko, near Four Square Church. When would you like to visit?`;
    followUpMessage = `Hi ${leadName}! Did you manage to find us? We're at KG 42 Street, Kimironko. Happy to welcome you anytime!`;
  }

  return { suggestedReply, followUpMessage };
}

async function callAIContinue(context: string): Promise<ReplyOutput> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI API key not configured");

  const baseURL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
      enable_thinking: false,
      messages: [
        { role: "system", content: CONTINUE_PROMPT },
        { role: "user", content: context },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI response is not valid JSON");
    parsed = JSON.parse(jsonMatch[0]);
  }

  return replyOutputSchema.parse(parsed);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = replyInputSchema.parse(body);

    const db = getDb();
    const lead = await db.lead.findUnique({
      where: { id: input.leadId },
      include: {
        suggestedPackage: { select: { name: true } },
        interactions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    const leadContext = [
      `LEAD PROFILE:`,
      `Name: ${lead.name || "Unknown"}`,
      `Phone: ${lead.phone}`,
      `Interest: ${lead.interest || "Not specified"}`,
      `Status: ${lead.status}`,
      `Suggested package: ${lead.suggestedPackage?.name || "None"}`,
      `Notes: ${lead.notes || "None"}`,
      lead.rawWhatsappSnippet ? `Previous conversation snippet: ${lead.rawWhatsappSnippet.slice(0, 500)}` : null,
      lead.aiSummary ? `AI summary: ${lead.aiSummary}` : null,
      `Recent interactions:`,
      ...lead.interactions.slice(0, 10).map((i) => `- [${i.type}] ${i.content.slice(0, 200)}`),
    ].filter(Boolean).join("\n");

    const fullContext = `${leadContext}\n\n---\n\nNEW WHATSAPP CONVERSATION:\n${input.chat}`;

    let result: ReplyOutput;
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      result = buildMockReply(lead, input.chat);
    } else {
      result = await callAIContinue(fullContext);
    }

    await db.interaction.create({
      data: {
        leadId: lead.id,
        type: "note",
        content: `WhatsApp conversation: ${input.chat.slice(0, 300)}${input.chat.length > 300 ? "..." : ""}`,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const zodError = error as Error & { issues: unknown[] };
      return NextResponse.json({ success: false, error: "Validation failed", details: zodError.issues }, { status: 400 });
    }
    console.error("[lead-assistant/reply] Error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate reply" },
      { status: 500 }
    );
  }
}
