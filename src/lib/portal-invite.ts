import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { whatsappUrl } from "@/lib/utils";

/**
 * Invites to the member portal.
 *
 * Most members reach Madar Hub through WhatsApp or by walking in, so nobody
 * arrives at the portal on their own. Staff send them a one-time link instead,
 * over the WhatsApp thread the conversation is already happening in.
 *
 * The token also removes the weakest part of self-signup: an account created
 * from an invite attaches to this exact Lead, rather than depending on the
 * member typing a phone number that happens to match.
 */

const INVITE_TTL_DAYS = 14;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PortalInviteResult = {
  signupUrl: string;
  whatsappUrl: string;
  expiresAt: Date;
};

function portalBaseUrl(): string {
  return process.env.MEMBER_PORTAL_URL || "https://madarorbit.com/membership";
}

/** The message staff send. Kept short — it is read on a phone, in a chat. */
export function inviteMessage(firstName: string | null, signupUrl: string): string {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  return `${greeting}

You can now manage your Madar Hub membership online: check your subscription status, see when your next payment is due, and renew in one tap.

Create your account here:
${signupUrl}

The link is personal to you and works for 14 days.`;
}

/**
 * Issues a fresh invite for a lead and returns the link plus a WhatsApp URL
 * with the message ready to send.
 *
 * Any earlier unused invite for the same lead is consumed first, so a member
 * cannot end up holding two working links.
 */
export async function createPortalInvite(leadId: string): Promise<PortalInviteResult> {
  const db = getDb();
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, name: true, phone: true },
  });
  if (!lead) throw new Error("Lead not found");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.$transaction([
    db.portalInvite.updateMany({
      where: { leadId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    db.portalInvite.create({
      data: { leadId, tokenHash: hashInviteToken(token), expiresAt },
    }),
  ]);

  const signupUrl = `${portalBaseUrl()}/signup?invite=${token}`;
  const firstName = lead.name?.trim().split(/\s+/)[0] || null;

  return {
    signupUrl,
    whatsappUrl: whatsappUrl(lead.phone, inviteMessage(firstName, signupUrl)),
    expiresAt,
  };
}
