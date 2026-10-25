import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { isDpoLive } from "@/lib/dpo";
import { startDpoCheckout } from "@/lib/dpo-checkout";
import { corsHeaders } from "@/lib/public-cors";

/**
 * POST /crm/api/public/dpo/checkout
 *
 * Called from the public madarorbit.com pricing page (unauthenticated).
 * Creates a DpoPayment row for the selected package and returns the
 * DPO-hosted page where the customer completes payment.
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

  // The page hides the option when DPO is not live, but a stale tab or a
  // direct post must not reach DPO either — a test-mode checkout would take a
  // real customer through a payment that moves no money.
  if (!isDpoLive()) {
    return NextResponse.json(
      { error: "DPO payment is not available right now. Please choose another way to pay or book via WhatsApp." },
      { status: 503, headers: cors },
    );
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Please fill in your name, email, and phone number." }, { status: 400, headers: cors });
    }
    const { packageSlug, customerName, customerEmail, customerPhone } = parsed.data;

    const pkg = await getDb().package.findUnique({ where: { slug: packageSlug } });
    if (!pkg || !pkg.active) {
      return NextResponse.json({ error: "This package is not available for online payment." }, { status: 404, headers: cors });
    }

    const { redirectUrl } = await startDpoCheckout({
      pkg,
      customerName,
      customerEmail,
      customerPhone,
      source: "website",
    });

    return NextResponse.json({ redirectUrl }, { headers: cors });
  } catch (error) {
    console.error("[DPO_CHECKOUT_ERROR]", error);
    return NextResponse.json(
      { error: "Something went wrong starting your payment. Please try again or book via WhatsApp." },
      { status: 500, headers: cors },
    );
  }
}
