import { NextResponse } from "next/server";
import { sendMemberReminders } from "@/lib/member-reminders";

export const dynamic = "force-dynamic";

/**
 * POST /crm/api/notifications/member-reminders
 *
 * Emails members whose payment is coming up, due, or about to lapse. Kept
 * separate from the staff payment digest: different audience, and a fault here
 * reaches customers rather than the office.
 *
 * Add ?dryRun=1 to get the exact recipient list back without sending anything.
 */
export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 500 });
    }
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ success: false, error: "RESEND_API_KEY is not configured" }, { status: 500 });
    }

    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const from = process.env.EMAIL_FROM || "Madar Hub <onboarding@resend.dev>";
    const portalUrl = process.env.MEMBER_PORTAL_URL || "https://madarorbit.com/membership";

    const result = await sendMemberReminders({ from, portalUrl, resendApiKey, dryRun });

    console.log("[member-reminders]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[member-reminders] Error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to send member reminders" },
      { status: 500 },
    );
  }
}
