import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { isMomoLive, requestToPay } from "@/lib/momo";
import { momoCheckoutAmounts } from "@/lib/pricing";
import { corsHeaders } from "@/lib/public-cors";
import { normalizePhone } from "@/lib/utils";

/**
 * POST /crm/api/public/momo/checkout
 *
 * Called from the public madarorbit.com pricing page (unauthenticated).
 * Creates a MomoPayment row for the selected package and pushes a PIN prompt
 * to the customer's MTN handset.
 *
 * There is no redirect to hand back — MoMo resolves on the phone. The response
 * carries the reference the page then polls with /api/public/momo/status.
 */

const bodySchema = z.object({
  packageSlug: z.string().min(1),
  customerName: z.string().trim().min(1).max(150),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().min(7).max(20),
});

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);

  // The page hides the option when MoMo is not live, but a stale tab or a
  // direct post must not reach MTN either — a sandbox checkout would take a
  // real customer through a payment that moves no money.
  if (!isMomoLive()) {
    return NextResponse.json(
      { error: "MoMo payment is not available right now. Please pay by card or book via WhatsApp." },
      { status: 503, headers: cors },
    );
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please fill in your name and MTN MoMo number." },
        { status: 400, headers: cors },
      );
    }
    const { packageSlug, customerName, customerEmail, customerPhone } = parsed.data;

    // MTN keys the prompt on the MSISDN, so a number it cannot resolve to a
    // subscriber must be rejected here rather than becoming a silent failure
    // on someone else's handset.
    const phone = normalizePhone(customerPhone);
    if (!/^250\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: "Enter a valid Rwandan MTN number, for example 078xxxxxxx." },
        { status: 400, headers: cors },
      );
    }

    const db = getDb();
    const pkg = await db.package.findUnique({ where: { slug: packageSlug } });
    if (!pkg || !pkg.active) {
      return NextResponse.json(
        { error: "This package is not available for online payment." },
        { status: 404, headers: cors },
      );
    }

    const merchantReference = `MHMOMO-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const { amount, chargedAmount } = momoCheckoutAmounts(pkg.price);

    // The row is written before the prompt is sent so a MoMo call that
    // succeeds but whose response never reaches us still leaves a trace the
    // reconcile sweep can pick up.
    await db.momoPayment.create({
      data: {
        merchantReference,
        packageId: pkg.id,
        packageName: pkg.name,
        amount,
        chargedAmount,
        currency: "RWF",
        customerName,
        customerEmail: customerEmail || null,
        customerPhone: phone,
        status: "PENDING",
      },
    });

    let momoReferenceId: string;
    try {
      momoReferenceId = await requestToPay({
        externalId: merchantReference,
        amount: chargedAmount,
        payerPhone: phone,
        payerMessage: `Madar Hub - ${pkg.name}`,
        payeeNote: `${pkg.name} (${merchantReference})`,
      });
    } catch (error) {
      // The prompt never went out, so nothing can arrive later. Close the row
      // now instead of leaving the sweep to age out a payment that never was.
      await db.momoPayment.update({
        where: { merchantReference },
        data: { status: "FAILED", failureReason: "Could not reach MTN MoMo" },
      });
      throw error;
    }

    await db.momoPayment.update({ where: { merchantReference }, data: { momoReferenceId } });

    return NextResponse.json(
      { reference: merchantReference, amount: chargedAmount, status: "PENDING" },
      { headers: cors },
    );
  } catch (error) {
    console.error("[MOMO_CHECKOUT_ERROR]", error);
    return NextResponse.json(
      { error: "Something went wrong starting your MoMo payment. Please try again or book via WhatsApp." },
      { status: 500, headers: cors },
    );
  }
}
