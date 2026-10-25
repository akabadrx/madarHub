import { NextResponse } from "next/server";
import { isDpoLive } from "@/lib/dpo";
import { corsHeaders } from "@/lib/public-cors";

/**
 * GET /crm/api/public/dpo/availability
 *
 * Asked by the pricing page before it offers DPO Pay, and by the member portal
 * before it shows the DPO button. Returns false while the credentials are
 * missing or DPO_MODE is still "test", so a customer is never shown a payment
 * option that cannot take their money.
 *
 * Deliberately says only yes or no — nothing about why, which would leak
 * configuration state to an unauthenticated caller.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, "GET, OPTIONS") });
}

export async function GET(req: Request) {
  return NextResponse.json({ available: isDpoLive() }, { headers: corsHeaders(req, "GET, OPTIONS") });
}
