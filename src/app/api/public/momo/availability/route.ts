import { NextResponse } from "next/server";
import { isMomoLive } from "@/lib/momo";
import { corsHeaders } from "@/lib/public-cors";

/**
 * GET /crm/api/public/momo/availability
 *
 * Asked by the pricing page before it offers MoMo as a payment method, and by
 * the member portal before it shows the MoMo button. Returns false while the
 * credentials are missing or still pointed at MTN's sandbox, so a customer is
 * never shown a payment option that cannot take their money.
 *
 * Deliberately says only yes or no — nothing about why, which would leak
 * configuration state to an unauthenticated caller.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, "GET, OPTIONS") });
}

export async function GET(req: Request) {
  return NextResponse.json({ available: isMomoLive() }, { headers: corsHeaders(req, "GET, OPTIONS") });
}
