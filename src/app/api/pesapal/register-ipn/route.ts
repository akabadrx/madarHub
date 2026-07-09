import { NextResponse } from "next/server";
import { registerIPN } from "@/lib/pesapal";

/**
 * POST /crm/api/pesapal/register-ipn
 *
 * One-time setup: registers the IPN URL with Pesapal and returns the ipn_id
 * to store as PESAPAL_IPN_ID. Protected by the normal CRM password gate
 * (src/proxy.ts) since it's an admin action, not something Pesapal calls.
 */
export async function POST() {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured" }, { status: 503 });
    }

    const ipnUrl = `${appUrl}/api/public/pesapal/ipn`;
    const result = await registerIPN(ipnUrl);

    return NextResponse.json({ success: true, ipn_id: result.ipn_id, url: result.url });
  } catch (error) {
    console.error("[PESAPAL_REGISTER_IPN_ERROR]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register IPN" },
      { status: 500 }
    );
  }
}
