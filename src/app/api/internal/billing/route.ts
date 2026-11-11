import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { findLoyaltyOffer, subscriptionBilling, unpaidPenalty } from "@/lib/billing";

/**
 * GET /crm/api/internal/billing?leadId=...
 *
 * What the membership portal needs to show a member's prices: their Loyalty
 * offer if they qualify, every custom or Loyalty price with its commitment
 * progress and live penalty, and any unpaid penalty. The CRM owns these rules,
 * so the portal asks rather than working them out itself.
 *
 * Guarded by INTERNAL_API_SECRET rather than CORS — no browser calls this.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leadId = new URL(req.url).searchParams.get("leadId")?.trim();
  if (!leadId) return NextResponse.json({ error: "leadId is required." }, { status: 400 });

  const db = getDb();
  const subs = await db.subscription.findMany({
    where: { leadId, status: "active", priceOverride: { isNot: null } },
    select: { id: true },
  });
  const [penalty, loyaltyOffer, billings] = await Promise.all([
    unpaidPenalty(db, leadId),
    findLoyaltyOffer(db, leadId),
    Promise.all(subs.map((sub) => subscriptionBilling(db, sub.id))),
  ]);

  return NextResponse.json({
    unpaidPenalty: penalty,
    loyaltyOffer,
    subscriptions: billings.flatMap((b) =>
      b?.override
        ? [{
            subscriptionId: b.subscriptionId,
            standardTotal: b.standardTotal,
            dueAmount: b.info?.dueAmount ?? 0,
            override: {
              kind: b.override.kind,
              monthlyTotal: b.override.monthlyTotal,
              effectiveFrom: b.override.effectiveFrom,
              commitmentMonths: b.override.commitmentMonths,
              monthsPaid: b.override.monthsPaid,
              endDate: b.override.endDate,
              complete: b.override.complete,
              applies: b.override.applies,
              penaltyIfCancelledToday: b.override.penaltyIfCancelledToday,
              terms: b.override.terms,
              termsVersion: b.override.termsVersion,
              termsAccepted: b.override.termsAccepted,
            },
          }]
        : [],
    ),
  });
}
