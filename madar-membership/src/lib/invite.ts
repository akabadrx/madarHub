import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

/**
 * Portal invites issued by staff from the CRM.
 *
 * The CRM owns the PortalInvite table, so it is read here through raw queries
 * like every other CRM table. An invite is what makes a WhatsApp or walk-in
 * member land on an account already attached to their record, instead of
 * depending on them typing a phone number that happens to match.
 */

export type InvitedLead = {
  leadId: string;
  name: string | null;
  phone: string;
  email: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The lead behind a valid, unused, unexpired invite — or null. */
export async function readInvite(token: string | undefined | null): Promise<InvitedLead | null> {
  if (!token) return null;
  const rows = await getDb().$queryRaw<InvitedLead[]>`
    SELECT l.id AS "leadId", l.name, l.phone, l.email
    FROM public."PortalInvite" i
    JOIN public."Lead" l ON l.id = i."leadId"
    WHERE i."tokenHash" = ${hashToken(token)}
      AND i."consumedAt" IS NULL
      AND i."expiresAt" > now()
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Marks an invite used. Called once the account it created exists. */
export async function consumeInvite(token: string): Promise<void> {
  await getDb().$executeRaw`
    UPDATE public."PortalInvite"
    SET "consumedAt" = now()
    WHERE "tokenHash" = ${hashToken(token)} AND "consumedAt" IS NULL
  `;
}
