import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { isDpoLive } from "@/lib/dpo";
import { startDpoCheckout } from "@/lib/dpo-checkout";
import { portalCheckoutPrice } from "@/lib/billing";

/**
 * POST /crm/api/internal/dpo/checkout
 *
 * Server-to-server DPO checkout for the membership portal, which has already
 * authenticated the member. As with the internal Pesapal route, the customer
 * details come from the portal's session, not user input, and the member's
 * real Lead id travels with them.
 *
 * Guarded by INTERNAL_API_SECRET rather than CORS — no browser calls this.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  packageSlug: z.string().min(1),
  customerName: z.string().trim().min(1).max(150),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().min(7).max(20),
  leadId: z.string().trim().min(1).nullable().optional(),
  subscriptionId: z.string().trim().min(1).nullable().optional(),
});

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error("[INTERNAL_DPO_CHECKOUT] INTERNAL_API_SECRET is not configured");
    return NextResponse.json({ error: "Online payment is not configured yet." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDpoLive()) {
    return NextResponse.json({ error: "DPO payment is not available right now." }, { status: 503 });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
    }
    const { packageSlug, customerName, customerEmail, customerPhone, leadId, subscriptionId } = parsed.data;

    const db = getDb();
    const pkg = await db.package.findUnique({ where: { slug: packageSlug } });
    if (!pkg || !pkg.active) {
      return NextResponse.json({ error: "This package is not available for online payment." }, { status: 404 });
    }

    // A Lead id is only accepted if it actually exists, and a subscription
    // only if it belongs to that Lead — the same checks as the Pesapal route.
    let verifiedLeadId: string | null = null;
    if (leadId) {
      const lead = await db.lead.findUnique({ where: { id: leadId }, select: { id: true } });
      verifiedLeadId = lead?.id ?? null;
    }
    let verifiedSubscriptionId: string | null = null;
    if (subscriptionId && verifiedLeadId) {
      const sub = await db.subscription.findFirst({
        where: { id: subscriptionId, leadId: verifiedLeadId },
        select: { id: true },
      });
      verifiedSubscriptionId = sub?.id ?? null;
    }

    // The price comes from the member's records — a custom or Loyalty price
    // included — never from the request.
    const price = await portalCheckoutPrice(db, { leadId: verifiedLeadId, subscriptionId: verifiedSubscriptionId, pkg });
    if ("error" in price) return NextResponse.json({ error: price.error }, { status: 403 });

    const result = await startDpoCheckout({
      pkg,
      customerName,
      customerEmail,
      customerPhone,
      source: "membership",
      leadId: verifiedLeadId,
      subscriptionId: price.subscriptionId,
      saleAmount: price.saleAmount,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[INTERNAL_DPO_CHECKOUT_ERROR]", error);
    return NextResponse.json({ error: "Something went wrong starting your payment." }, { status: 500 });
  }
}
