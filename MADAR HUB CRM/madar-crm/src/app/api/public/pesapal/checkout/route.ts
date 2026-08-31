import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { submitOrderRequest } from "@/lib/pesapal";
import { checkoutAmounts } from "@/lib/pricing";
import { corsHeaders } from "@/lib/public-cors";

/**
 * POST /crm/api/public/pesapal/checkout
 *
 * Called from the public madarorbit.com pricing page (unauthenticated).
 * Creates a PesapalPayment record for the selected package and returns a
 * Pesapal-hosted redirect URL where the customer completes payment.
 */

const bodySchema = z.object({
  packageSlug: z.string().min(1),
  customerName: z.string().trim().min(1).max(150),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().min(7).max(20),
});

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Please fill in your name, email, and phone number." }, { status: 400, headers: cors });
    }
    const { packageSlug, customerName, customerEmail, customerPhone } = parsed.data;

    const db = getDb();
    const pkg = await db.package.findUnique({ where: { slug: packageSlug } });
    if (!pkg || !pkg.active) {
      return NextResponse.json({ error: "This package is not available for online payment." }, { status: 404, headers: cors });
    }

    const siteUrl = process.env.MADAR_SITE_URL;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!siteUrl || !appUrl) {
      console.error("[PESAPAL_CHECKOUT] Missing MADAR_SITE_URL or NEXT_PUBLIC_APP_URL");
      return NextResponse.json({ error: "Online payment is not configured yet. Please book via WhatsApp." }, { status: 503, headers: cors });
    }

    const merchantReference = `MH-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const { amount: amountIncludingVat, chargedAmount } = checkoutAmounts(pkg.price);

    await db.pesapalPayment.create({
      data: {
        merchantReference,
        packageId: pkg.id,
        packageName: pkg.name,
        amount: amountIncludingVat,
        chargedAmount,
        currency: "RWF",
        customerName,
        customerEmail,
        customerPhone,
        status: "PENDING",
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

    return NextResponse.json({ redirectUrl: orderResult.redirect_url }, { headers: cors });
  } catch (error) {
    console.error("[PESAPAL_CHECKOUT_ERROR]", error);
    return NextResponse.json({ error: "Something went wrong starting your payment. Please try again or book via WhatsApp." }, { status: 500, headers: cors });
  }
}
