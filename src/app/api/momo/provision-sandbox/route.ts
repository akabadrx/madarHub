import { NextResponse } from "next/server";
import { provisionSandboxApiUser } from "@/lib/momo";

/**
 * POST /crm/api/momo/provision-sandbox
 *
 * One-shot helper that creates the MTN sandbox API user and key, the two
 * values you cannot get from the developer portal UI. Run it once, copy the
 * result into MOMO_API_USER / MOMO_API_KEY, and never call it again.
 *
 * Guarded by CRON_SECRET and refuses to run against anything but the sandbox
 * host — the production endpoint does not exist, and pointing this at a live
 * base URL should fail loudly rather than half-succeed.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.MOMO_BASE_URL || "";
  if (!baseUrl.includes("sandbox")) {
    return NextResponse.json(
      { error: "Refusing to provision: MOMO_BASE_URL is not the MTN sandbox host." },
      { status: 400 },
    );
  }

  try {
    // MTN requires a callback host on the API user even when callbacks are
    // unused; it must be a bare hostname, not a URL.
    const host = (process.env.MOMO_PROVIDER_CALLBACK_HOST || "madarorbit.com").replace(/^https?:\/\//, "");
    const credentials = await provisionSandboxApiUser(host);

    console.log("[MOMO] Sandbox API user provisioned:", credentials.apiUser);

    return NextResponse.json({
      ...credentials,
      next: "Copy these into MOMO_API_USER and MOMO_API_KEY, then restart the app.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[MOMO_PROVISION_ERROR]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
