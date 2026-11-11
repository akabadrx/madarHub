// A member's custom prices and Loyalty offer, as the CRM works them out.
//
// The CRM owns every billing rule (eligibility, commitment, penalty) and the
// figures themselves, so the portal asks it instead of repeating the maths.
// Server-only: this is deliberately not a "use server" module, which would let
// a browser call it with somebody else's lead id.

export type MemberOverride = {
  kind: "loyalty" | "custom";
  monthlyTotal: number;
  commitmentMonths: number | null;
  monthsPaid: number;
  endDate: Date | null;
  complete: boolean;
  applies: boolean;
  penaltyIfCancelledToday: number;
  terms: string | null;
  termsVersion: string | null;
  termsAccepted: boolean;
};

export type MemberBilling = {
  unpaidPenalty: number;
  loyaltyOffer: {
    subscriptionId: string;
    packageSlug: string;
    standardTotal: number;
    monthlyTotal: number;
    commitmentMonths: number;
    terms: string;
    termsVersion: string;
    startsOn: Date;
    dueNow: boolean;
  } | null;
  subscriptions: { subscriptionId: string; standardTotal: number | null; dueAmount: number; override: MemberOverride }[];
};

type Raw = MemberBilling & Record<string, unknown>;

const date = (value: unknown) => (value ? new Date(String(value)) : null);

/** Null when the CRM cannot be reached: the page then shows standard prices only. */
export async function getMemberBilling(leadId: string): Promise<MemberBilling | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  const crmBaseUrl = process.env.CRM_BASE_URL || "https://madarorbit.com/crm";
  if (!secret) return null;
  try {
    const response = await fetch(`${crmBaseUrl}/api/internal/billing?leadId=${encodeURIComponent(leadId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Raw;
    return {
      unpaidPenalty: data.unpaidPenalty ?? 0,
      loyaltyOffer: data.loyaltyOffer ? { ...data.loyaltyOffer, startsOn: date(data.loyaltyOffer.startsOn) ?? new Date() } : null,
      subscriptions: (data.subscriptions ?? []).map((sub) => ({
        ...sub,
        override: { ...sub.override, endDate: date(sub.override.endDate) },
      })),
    };
  } catch (error) {
    console.error("[billing]", error instanceof Error ? error.message : error);
    return null;
  }
}
