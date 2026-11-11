import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { findLoyaltyOffer } from "@/lib/billing";

/**
 * POST /crm/api/internal/billing/accept
 *
 * A signed-in member ticks "I have read and agree" on the portal. Two cases:
 *
 * - The subscription has no custom price yet: this is the member taking up
 *   the Loyalty Rate. Eligibility is checked again here, so the offer cannot
 *   be taken by anyone the card was not shown to, and the Loyalty price is
 *   created from the CRM's own figures.
 * - It has a committed custom price set by staff: this records consent to
 *   those terms, which checkout requires before taking the next payment.
 *
 * Either way the acceptance is stored with the member, the terms version they
 * saw and their IP address. Guarded by INTERNAL_API_SECRET.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  leadId: z.string().trim().min(1),
  subscriptionId: z.string().trim().min(1),
  portalUserId: z.string().trim().min(1),
  termsVersion: z.string().trim().min(1),
  ipAddress: z.string().trim().max(100).nullable().optional(),
});

const MEMBER = "Member (portal)";

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { leadId, subscriptionId, portalUserId, termsVersion, ipAddress } = parsed.data;
  const acceptance = { subscriptionId, leadId, portalUserId, termsVersion, ipAddress: ipAddress || null };

  try {
    return await getDb().$transaction(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { id: subscriptionId, leadId, status: "active" },
        include: { priceOverride: true },
      });
      if (!sub) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });

      const existing = sub.priceOverride;
      if (existing) {
        if (!existing.commitmentMonths) return NextResponse.json({ ok: true });
        if (existing.termsVersion !== termsVersion) {
          return NextResponse.json({ error: "These terms have changed. Reload the page to read the new version." }, { status: 409 });
        }
        await tx.termsAcceptance.create({ data: acceptance });
        await tx.billingAuditLog.create({
          data: { leadId, subscriptionId, action: "terms_accepted", changedBy: MEMBER, newAmount: existing.amount, note: `Accepted terms ${termsVersion}` },
        });
        return NextResponse.json({ ok: true });
      }

      const offer = await findLoyaltyOffer(tx, leadId);
      if (!offer || offer.subscriptionId !== subscriptionId) {
        return NextResponse.json({ error: "This offer is not available on your account." }, { status: 403 });
      }
      if (offer.termsVersion !== termsVersion) {
        return NextResponse.json({ error: "These terms have changed. Reload the page to read the new version." }, { status: 409 });
      }

      await tx.priceOverride.create({
        data: {
          subscriptionId,
          kind: "loyalty",
          amount: offer.monthlyTotal,
          vatInclusive: true,
          effectiveFrom: offer.startsOn,
          commitmentMonths: offer.commitmentMonths,
          terms: offer.terms,
          termsVersion: offer.termsVersion,
          note: "Taken up by the member on the portal.",
        },
      });
      await tx.termsAcceptance.create({ data: acceptance });
      await tx.billingAuditLog.create({
        data: { leadId, subscriptionId, action: "loyalty_accepted", changedBy: MEMBER, oldAmount: offer.standardTotal, newAmount: offer.monthlyTotal, note: `Loyalty Rate from the cycle starting ${offer.startsOn.toISOString().slice(0, 10)}` },
      });
      await tx.interaction.create({
        data: { leadId, type: "note", content: `Switched to the Loyalty Rate (${offer.monthlyTotal.toLocaleString()} RWF/month, ${offer.commitmentMonths}-month commitment) on the portal.` },
      });
      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    // A double submit races on the one-override-per-subscription constraint:
    // the first one won, which is the outcome the member asked for.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true });
    }
    console.error("[BILLING_ACCEPT_ERROR]", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
