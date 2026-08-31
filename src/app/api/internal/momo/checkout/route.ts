import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requestToPay } from "@/lib/momo";
import { momoCheckoutAmounts } from "@/lib/pricing";
import { normalizePhone } from "@/lib/utils";

/**
 * POST /crm/api/internal/momo/checkout
 *
 * Server-to-server MoMo checkout for the membership portal, which has already
 * authenticated the member. As with the Pesapal internal route, the customer
 * details are not user input: the portal reads them from its own session and
 * sends the member's real Lead id, so fulfilment does not have to guess.
 *
 * Guarded by INTERNAL_API_SECRET rather than CORS — no browser calls this.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  packageSlug: z.string().min(1),
  customerName: z.string().trim().min(1).max(150),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().min(7).max(20),
  leadId: z.string().trim().min(1).nullable().optional(),
});

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error("[INTERNAL_MOMO_CHECKOUT] INTERNAL_API_SECRET is not configured");
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

    const phone = normalizePhone(customerPhone);
    if (!/^250\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: "Add a valid Rwandan MTN number to your details before paying with MoMo." },
        { status: 400 },
      );
    }

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

    const merchantReference = `MHMOMOM-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const { amount, chargedAmount } = momoCheckoutAmounts(pkg.price);

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
        source: "membership",
        leadId: verifiedLeadId,
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
      await db.momoPayment.update({
        where: { merchantReference },
        data: { status: "FAILED", failureReason: "Could not reach MTN MoMo" },
      });
      throw error;
    }

    await db.momoPayment.update({ where: { merchantReference }, data: { momoReferenceId } });

    return NextResponse.json({ reference: merchantReference, amount, chargedAmount, status: "PENDING" });
  } catch (error) {
    console.error("[INTERNAL_MOMO_CHECKOUT_ERROR]", error);
    return NextResponse.json({ error: "Something went wrong starting your MoMo payment." }, { status: 500 });
  }
}
