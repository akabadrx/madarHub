import { randomBytes } from "crypto";
import type { Package } from "@prisma/client";
import { getDb } from "@/lib/db";
import { createToken, dpoPaymentUrl, isDpoTestMode } from "@/lib/dpo";
import { dpoCheckoutAmounts } from "@/lib/pricing";

/**
 * Opens a DPO transaction for a package and returns where to send the
 * customer. Shared by the public pricing-page route and the portal's internal
 * route, which differ only in who the customer is and how they were checked.
 */
export async function startDpoCheckout(input: {
  pkg: Package;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  source: "website" | "membership";
  leadId?: string | null;
  subscriptionId?: string | null;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("[DPO] Missing NEXT_PUBLIC_APP_URL");

  const db = getDb();
  const prefix = input.source === "membership" ? "MHMDPO" : "MHDPO";
  const merchantReference = `${prefix}-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const { amount, chargedAmount } = dpoCheckoutAmounts(input.pkg.price);

  // The row is written before DPO is called so a token that is created but
  // whose response never reaches us still leaves a trace.
  await db.dpoPayment.create({
    data: {
      merchantReference,
      packageId: input.pkg.id,
      packageName: input.pkg.name,
      amount,
      chargedAmount,
      currency: "RWF",
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      status: "PENDING",
      source: input.source,
      leadId: input.leadId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      testMode: isDpoTestMode(),
    },
  });

  const nameParts = input.customerName.trim().split(/\s+/);
  const callbackUrl = `${appUrl}/api/public/dpo/callback`;

  let token: Awaited<ReturnType<typeof createToken>>;
  try {
    token = await createToken({
      merchantReference,
      amount: chargedAmount,
      currency: "RWF",
      description: `Madar Hub - ${input.pkg.name}`.slice(0, 100),
      redirectUrl: callbackUrl,
      // The back link carries the reference itself, since DPO is not
      // guaranteed to append its own query to it.
      backUrl: `${callbackUrl}?CompanyRef=${encodeURIComponent(merchantReference)}&cancelled=1`,
      customerEmail: input.customerEmail,
      customerFirstName: nameParts[0] || "",
      customerLastName: nameParts.slice(1).join(" ") || "",
      customerPhone: input.customerPhone ?? undefined,
    });
  } catch (error) {
    // No token means nothing can be paid, so nothing can arrive later. Close
    // the row now instead of leaving the sweep to age it out.
    await db.dpoPayment.update({
      where: { merchantReference },
      data: { status: "FAILED", failureReason: "Could not open a DPO transaction" },
    });
    throw error;
  }

  await db.dpoPayment.update({
    where: { merchantReference },
    data: { transToken: token.transToken, transRef: token.transRef },
  });

  return { redirectUrl: dpoPaymentUrl(token.transToken), merchantReference, amount, chargedAmount };
}
