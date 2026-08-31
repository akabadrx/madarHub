"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  backfillLeadEmail,
  findLeadByEmail,
  findLeadByPhone,
  getLead,
  getPackageBySlug,
  markLeadPortalLinked,
} from "@/lib/crm";
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
        "Add your phone number under Your details before paying online, or book on WhatsApp.",
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
 * Whether the portal should offer MoMo at all.
 *
 * The CRM owns the MoMo credentials, so it is the only thing that can answer
 * this — and it answers false while they are missing or still pointed at MTN's
 * sandbox. Asking means going live is a matter of swapping the CRM's env vars,
 * with no portal redeploy.
 */
export async function isMomoAvailable(): Promise<boolean> {
  const crmBaseUrl = process.env.CRM_BASE_URL || "https://madarorbit.com/crm";
  try {
    const response = await fetch(`${crmBaseUrl}/api/public/momo/availability`, {
      // Short-lived cache: the dashboard is rendered per request, and this must
      // not become one CRM round-trip per page view.
      next: { revalidate: 60 },
    });
    if (!response.ok) return false;
    const data = (await response.json().catch(() => ({}))) as { available?: boolean };
    return data.available === true;
  } catch (error) {
    // Unreachable is treated as unavailable: showing a payment method we
    // cannot confirm works is worse than showing one fewer.
    console.error("[momo-availability]", error instanceof Error ? error.message : error);
    return false;
  }
}

export type MomoStartResult =
  | { error: string }
  | { reference: string; phone: string; amount: number; packageName: string };

/**
 * Starts an MTN MoMo checkout for the signed-in member.
 *
 * Unlike Pesapal there is nowhere to send the member: MoMo pushes a PIN prompt
 * to their handset and this returns a reference the page then polls with
 * `checkMomoStatus`. As with the Pesapal action, identity comes from the
 * session and the CRM record, never from the form.
 */
export async function startMomoCheckout(packageSlug: string): Promise<MomoStartResult> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const slug = packageSlug.trim();
  if (!slug) return { error: "Choose a package first." };

  const pkg = await getPackageBySlug(slug);
  if (!pkg) return { error: "That package is not available for online payment right now." };

  const lead = user.leadId ? await getLead(user.leadId) : null;

  // The prompt is pushed to this number, so a member with none on file — or
  // with one MTN cannot resolve — cannot start a MoMo payment.
  const phone = normalizePhone(user.phone || lead?.phone || "");
  if (!/^250\d{9}$/.test(phone)) {
    return {
      error:
        "Add your MTN number under Your details before paying with MoMo, or book on WhatsApp.",
    };
  }

  const secret = process.env.INTERNAL_API_SECRET;
  const crmBaseUrl = process.env.CRM_BASE_URL || "https://madarorbit.com/crm";
  if (!secret) {
    console.error("[momo-checkout] INTERNAL_API_SECRET is not configured");
    return { error: "Online payment is not set up yet. Please book on WhatsApp." };
  }

  try {
    const response = await fetch(`${crmBaseUrl}/api/internal/momo/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        packageSlug: slug,
        customerName: lead?.name || user.fullName,
        customerEmail: user.email,
        customerPhone: phone,
        leadId: user.leadId,
      }),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as {
      reference?: string;
      chargedAmount?: number;
      error?: string;
    };

    if (!response.ok || !data.reference) {
      console.error(`[momo-checkout] CRM returned ${response.status}: ${data.error ?? "no reference"}`);
      return { error: data.error || "Something went wrong starting your payment. Please try again." };
    }

    return {
      reference: data.reference,
      phone,
      amount: data.chargedAmount ?? 0,
      packageName: pkg.name,
    };
  } catch (error) {
    console.error("[momo-checkout]", error instanceof Error ? error.message : error);
    return { error: "Could not reach the payment service. Please try again in a moment." };
  }
}

export type MomoStatusResult = {
  status: "PENDING" | "COMPLETED" | "FAILED" | "ABANDONED";
  reason?: string | null;
};

/**
 * Polled by the package picker while the member answers the prompt.
 *
 * Anything that is not a definite outcome reports PENDING: a wobble reaching
 * the CRM must not tell a member their payment failed while their handset is
 * still holding the prompt.
 */
export async function checkMomoStatus(reference: string): Promise<MomoStatusResult> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const secret = process.env.INTERNAL_API_SECRET;
  const crmBaseUrl = process.env.CRM_BASE_URL || "https://madarorbit.com/crm";
  if (!secret) return { status: "PENDING" };

  try {
    const response = await fetch(
      `${crmBaseUrl}/api/internal/momo/status?ref=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" },
    );
    if (!response.ok) return { status: "PENDING" };

    const data = (await response.json().catch(() => ({}))) as MomoStatusResult;
    return { status: data.status ?? "PENDING", reason: data.reason ?? null };
  } catch (error) {
    console.error("[momo-status]", error instanceof Error ? error.message : error);
    return { status: "PENDING" };
  }
}

/**
 * Connects a member account to its CRM Lead.
 *
 * Email is the primary identifier: it is what the member signs in with, it is
 * stable when someone changes SIM, and it is unique per account. Phone is only
 * consulted when no Lead carries the address, because every member who predates
 * email collection is reachable by number alone — matching on email only would
 * strand them.
 *
 * Whenever a match is made, the member's email is written back to the Lead if
 * it has none, so the CRM accumulates addresses and email becomes primary in
 * practice rather than just in intent.
 *
 * Returns the linked Lead id, so a caller can use it without re-reading the
 * session.
 */
export async function linkAccountToLead(
  userId: string,
  email: string,
  phone: string | null,
): Promise<string | null> {
  const db = getDb();

  let lead = await findLeadByEmail(email);
  if (!lead && phone) {
    lead = await findLeadByPhone(normalizePhone(phone));
  }
  if (!lead) return null;

  // A Lead already claimed by someone else must not be taken over.
  const claimed = await db.membershipUser.findUnique({
    where: { leadId: lead.id },
    select: { id: true },
  });
  if (claimed && claimed.id !== userId) return null;

  if (!claimed) {
    await db.membershipUser.update({ where: { id: userId }, data: { leadId: lead.id } });
  }
  await backfillLeadEmail(lead.id, email);
  await markLeadPortalLinked(lead.id);
  return lead.id;
}
