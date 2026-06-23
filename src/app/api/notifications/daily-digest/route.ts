import { NextResponse } from "next/server";
import { sendFollowUpDigestEmail } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ success: false, error: "RESEND_API_KEY is not configured" }, { status: 500 });
    }

    const to = process.env.NOTIFICATION_EMAIL || "badribrahimak@gmail.com";
    const from = process.env.EMAIL_FROM || "Madar Hub CRM <onboarding@resend.dev>";
    const crmBaseUrl = process.env.CRM_BASE_URL || "https://madarorbit.com/crm";

    const result = await sendFollowUpDigestEmail({ to, from, crmBaseUrl, resendApiKey });

    console.log("[daily-digest] Result:", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[daily-digest] Error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to send digest" },
      { status: 500 }
    );
  }
}
