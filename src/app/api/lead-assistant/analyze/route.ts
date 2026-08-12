import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { analyzeInputSchema } from "@/lib/lead-assistant-validation";
import { analyzeLeadConversation, packageForClient, type AssistantPackage } from "@/lib/lead-assistant";

export async function POST(request: Request) {
  try {
    const input = analyzeInputSchema.parse(await request.json());
    const rows = await getDb().package.findMany({
      where: { active: true, slug: { not: null } },
      orderBy: [{ price: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, price: true, billingType: true, description: true },
    });
    const packages = rows.map((pkg) => ({ ...pkg, slug: pkg.slug! })) satisfies AssistantPackage[];
    const result = await analyzeLeadConversation({
      conversation: input.chat,
      packages,
      previousAnalysis: input.previousAnalysis,
      followUpDate: input.followUpDate,
    });

    return NextResponse.json({
      success: true,
      data: result,
      packages: packages.map(packageForClient),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const zodError = error as Error & { issues: unknown[] };
      return NextResponse.json(
        { success: false, error: "Validation failed", details: zodError.issues },
        { status: 400 },
      );
    }

    console.error("[lead-assistant] Analysis error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to analyze lead" },
      { status: 500 },
    );
  }
}
