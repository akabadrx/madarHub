import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fulfillDpoPayment } from "@/lib/dpo-fulfillment";

/**
 * GET /crm/api/public/dpo/callback
 *
 * DPO sends the customer's browser here after payment (RedirectURL, with
 * TransactionToken and CompanyRef appended) and when they press cancel
 * (BackURL, which carries the reference and cancelled=1 itself). Neither is
 * trusted as an outcome: the transaction is verified with DPO, and the
 * customer is sent to a result page — the public site for a website checkout,
 * or the member portal for someone who paid while signed in there.
 */

/**
 * DPO appends its query with "?" whatever the URL already holds, so a
 * reference from the back link can arrive as "MHDPO-…?TransID=…".
 */
function cleanRef(value: string | null): string | null {
  const ref = value?.split("?")[0].trim();
  return ref || null;
}

export async function GET(req: NextRequest) {
  const siteUrl = process.env.MADAR_SITE_URL || "";
  const { searchParams } = new URL(req.url);
  const companyRef = cleanRef(searchParams.get("CompanyRef"));
  const transToken = cleanRef(searchParams.get("TransactionToken"));
  const cancelled = (searchParams.get("cancelled") ?? "").startsWith("1");

  if (!companyRef && !transToken) {
    return NextResponse.redirect(`${siteUrl}/payment-failed.html`);
  }

  try {
    const db = getDb();
    let payment = companyRef
      ? await db.dpoPayment.findUnique({ where: { merchantReference: companyRef } })
      : await db.dpoPayment.findUnique({ where: { transToken: transToken! } });
    if (!payment) {
      return NextResponse.redirect(`${siteUrl}/payment-failed.html`);
    }

    if (payment.status === "PENDING") {
      payment = (await fulfillDpoPayment(payment.merchantReference)) || payment;
    }

    // A customer who pressed cancel has not paid, but the token stays payable
    // until DPO's time limit passes, so the row is left for the sweep to
    // close. What they see is the plain answer: the payment did not happen.
    const outcome =
      payment.status === "COMPLETED"
        ? "success"
        : payment.status === "FAILED" || cancelled
          ? "failed"
          : "pending";

    const params = new URLSearchParams({
      ref: payment.merchantReference,
      package: payment.packageName,
      amount: String(payment.chargedAmount ?? payment.amount),
    });

    if (payment.source === "membership") {
      const portalUrl = process.env.MEMBER_PORTAL_URL || `${siteUrl}/membership`;
      params.set("payment", outcome);
      return NextResponse.redirect(`${portalUrl}?${params.toString()}`);
    }

    return NextResponse.redirect(`${siteUrl}/payment-${outcome}.html?${params.toString()}`);
  } catch (error) {
    console.error("[DPO_CALLBACK_ERROR]", error);
    return NextResponse.redirect(`${siteUrl}/payment-pending.html`);
  }
}
