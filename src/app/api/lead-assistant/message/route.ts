import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const messageSchema = z.object({
  leadId: z.string().min(1),
  content: z.string().trim().min(1).max(10000),
});

export async function POST(request: Request) {
  try {
    const data = messageSchema.parse(await request.json());
    await getDb().interaction.create({
      data: { leadId: data.leadId, type: "whatsapp-out", content: data.content },
    });
    revalidatePath(`/leads/${data.leadId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to record message" },
      { status: 400 },
    );
  }
}
