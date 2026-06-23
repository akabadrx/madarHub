import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { z } from "zod";

const saveLeadSchema = z.object({
  name: z.string().optional().default(""),
  phone: z.string().min(7, "Phone number is required"),
  source: z.string().min(1).default("WhatsApp Direct"),
  interest: z.string().optional().default(""),
  status: z.string().min(1).default("New Lead"),
  notes: z.string().optional().default(""),
  rawWhatsappSnippet: z.string().optional(),
  aiSummary: z.string().optional(),
  aiConfidence: z.string().or(z.number()).optional().transform((v) => v ? Number(v) : null),
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const entries = Object.fromEntries(formData.entries());
    const data = saveLeadSchema.parse(entries);

    const db = getDb();
    const lead = await db.lead.create({
      data: {
        name: data.name || null,
        phone: data.phone,
        source: data.source,
        interest: data.interest || null,
        status: data.status,
        notes: data.notes || null,
        rawWhatsappSnippet: data.rawWhatsappSnippet || null,
        aiSummary: data.aiSummary || null,
        aiConfidence: data.aiConfidence,
      },
    });

    await db.interaction.create({
      data: {
        leadId: lead.id,
        type: "lead",
        content: `Lead created via WhatsApp Lead Assistant (AI confidence: ${Math.round((data.aiConfidence || 0) * 100)}%)`,
      },
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
      { status: 500 }
    );
  }
}