"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { findLeadByPhone, getLead, getPackageBySlug } from "@/lib/crm";
import { getDb } from "@/lib/db";
import { normalizePhone } from "@/lib/utils";

export type CheckoutState = { error?: string };

/**
 * Starts a Pesapal checkout for the signed-in member.
 *
 * The member supplies only which package they want. Their name, phone, email
 * and Lead come from the session and the CRM record, never from the form, so
 * nobody can bill under another person's identity — and so a member never has
 * to retype details the system already holds.
 */
export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const packageSlug = String(formData.get("packageSlug") ?? "").trim();
  if (!packageSlug) return { error: "Choose a package first." };

  const pkg = await getPackageBySlug(packageSlug);
  if (!pkg) return { error: "That package is not available for online payment right now." };

  const lead = user.leadId ? await getLead(user.leadId) : null;

  // Pesapal resolves the mobile-money network from the billing phone, so a
  // member with no number on file cannot be sent to checkout.
  const phone = normalizePhone(user.phone || lead?.phone || "");
  if (phone.length < 9) {
    return {
      error:
        "We need a phone number before you can pay online. Add yours on your profile, or book on WhatsApp.",
    };
  }

  const secret = process.env.INTERNAL_API_SECRET;
  const crmBaseUrl = process.env.CRM_BASE_URL || "https://madarorbit.com/crm";
  if (!secret) {
    console.error("[checkout] INTERNAL_API_SECRET is not configured");
    return { error: "Online payment is not set up yet. Please book on WhatsApp." };
  }

  let redirectUrl: string;
  try {
    const response = await fetch(`${crmBaseUrl}/api/internal/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        packageSlug,
        customerName: lead?.name || user.fullName,
        customerEmail: user.email,
        customerPhone: phone,
        leadId: user.leadId,
      }),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
    if (!response.ok || !data.redirectUrl) {
      console.error(`[checkout] CRM returned ${response.status}: ${data.error ?? "no redirect url"}`);
      return { error: data.error || "Something went wrong starting your payment. Please try again." };
    }
    redirectUrl = data.redirectUrl;
  } catch (error) {
    console.error("[checkout]", error instanceof Error ? error.message : error);
    return { error: "Could not reach the payment service. Please try again in a moment." };
  }

  // redirect() throws, so it must sit outside the try block above.
  redirect(redirectUrl);
}

/**
 * Links a member account to its CRM Lead once a matching phone number exists —
 * for accounts created before the member had a record, and for Google sign-ups,
 * which carry no phone number at all. Returns the linked Lead id, so a caller
 * can use it straight away without re-reading the session.
 */
export async function linkAccountToLeadIfPossible(
  userId: string,
  phone: string | null,
): Promise<string | null> {
  if (!phone) return null;
  const db = getDb();
  const lead = await findLeadByPhone(normalizePhone(phone));
  if (!lead) return null;

  const claimed = await db.membershipUser.findUnique({
    where: { leadId: lead.id },
    select: { id: true },
  });
  if (claimed) return null;

  await db.membershipUser.update({ where: { id: userId }, data: { leadId: lead.id } });
  return lead.id;
}
