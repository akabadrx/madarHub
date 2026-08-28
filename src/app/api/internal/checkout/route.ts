import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { submitOrderRequest } from "@/lib/pesapal";
import { checkoutAmounts } from "@/lib/pricing";

/**
 * POST /crm/api/internal/checkout
 *
 * Server-to-server checkout for the membership portal, which has already
 * authenticated the member. Unlike the public route, the customer details here
 * are not user input: the portal reads them from its own session and sends the
 * member's real Lead id, so fulfilment does not have to guess who paid from a
 * phone number.
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
});

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error("[INTERNAL_CHECKOUT] INTERNAL_API_SECRET is not configured");
    return NextResponse.json({ error: "Online payment is not configured yet." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
    }
    const { packageSlug, customerName, customerEmail, customerPhone, leadId } = parsed.data;

    const db = getDb();
    const pkg = await db.package.findUnique({ where: { slug: packageSlug } });
    if (!pkg || !pkg.active) {
      return NextResponse.json({ error: "This package is not available for online payment." }, { status: 404 });
    }

    // A Lead id is only accepted if it actually exists; a stale one would
    // otherwise attach the payment to nothing and lose the attribution.
    let verifiedLeadId: string | null = null;
    if (leadId) {
      const lead = await db.lead.findUnique({ where: { id: leadId }, select: { id: true } });
      verifiedLeadId = lead?.id ?? null;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      console.error("[INTERNAL_CHECKOUT] Missing NEXT_PUBLIC_APP_URL");
      return NextResponse.json({ error: "Online payment is not configured yet." }, { status: 503 });
    }

    const merchantReference = `MHM-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const { amount, chargedAmount } = checkoutAmounts(pkg.price);

    await db.pesapalPayment.create({
      data: {
        merchantReference,
        packageId: pkg.id,
        packageName: pkg.name,
        amount,
        chargedAmount,
        currency: "RWF",
        customerName,
        customerEmail,
        customerPhone,
        status: "PENDING",
        source: "membership",
        leadId: verifiedLeadId,
      },
    });

    const safeDescription = `Payment: ${pkg.name}`.replace(/[^\w\s-:]/gi, "").trim().slice(0, 100);
    const nameParts = customerName.trim().split(/\s+/);

    const orderResult = await submitOrderRequest({
      merchantReference,
      amount: chargedAmount,
      currency: "RWF",
      description: safeDescription,
      callbackUrl: `${appUrl}/api/public/pesapal/callback`,
      customerEmail,
      customerFirstName: nameParts[0] || "",
      customerLastName: nameParts.slice(1).join(" ") || "",
      customerPhone,
    });

    if (orderResult.order_tracking_id) {
      await db.pesapalPayment.update({
        where: { merchantReference },
        data: { pesapalTrackingId: orderResult.order_tracking_id },
      });
    }

    return NextResponse.json({
      redirectUrl: orderResult.redirect_url,
      merchantReference,
      amount,
      chargedAmount,
    });
  } catch (error) {
    console.error("[INTERNAL_CHECKOUT_ERROR]", error);
    return NextResponse.json({ error: "Something went wrong starting your payment." }, { status: 500 });
  }
}
