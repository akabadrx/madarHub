import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { exchangeCodeForProfile, isGoogleConfigured } from "@/lib/google";
import { startSession } from "@/lib/session";
import { findLeadByPhone } from "@/lib/crm";

export const dynamic = "force-dynamic";

function fail(request: Request, reason: string) {
  return NextResponse.redirect(new URL(`/membership/login?reason=${reason}`, request.url));
}

/** GET /membership/api/auth/google/callback — completes the Google sign-in. */
export async function GET(request: Request) {
  if (!isGoogleConfigured()) return fail(request, "google_failed");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail(request, "google_failed");

  const db = getDb();

  // Consuming the state row here means a replayed callback finds nothing and
  // is rejected, even if the same code is presented twice.
  const stored = await db.oAuthState.findUnique({ where: { state } });
  if (stored) await db.oAuthState.delete({ where: { id: stored.id } });
  if (!stored || stored.expiresAt < new Date()) return fail(request, "google_failed");

  let profile;
  try {
    profile = await exchangeCodeForProfile(code, stored.codeVerifier);
  } catch (error) {
    console.error("[google-callback]", error instanceof Error ? error.message : error);
    return fail(request, "google_failed");
  }

  // An unverified Google address proves nothing about who owns it, and would
  // otherwise be a way to take over an account by its email address.
  if (!profile.emailVerified) return fail(request, "google_failed");

  const linked = await db.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: "google", providerUserId: profile.sub } },
    select: { userId: true },
  });

  let userId = linked?.userId ?? null;

  if (!userId) {
    const existing = await db.membershipUser.findUnique({
      where: { email: profile.email },
      select: { id: true, disabledAt: true },
    });

    if (existing) {
      if (existing.disabledAt) return fail(request, "google_failed");
      // Same person, signing in with Google for the first time.
      await db.oAuthAccount.create({
        data: { userId: existing.id, provider: "google", providerUserId: profile.sub },
      });
      userId = existing.id;
    } else {
      // New account straight from Google. There is no phone number in a Google
      // profile, so this account starts unlinked; the member can add their
      // number later and be matched to their CRM record then.
      const created = await db.$transaction(async (tx) => {
        const user = await tx.membershipUser.create({
          data: {
            email: profile.email,
            fullName: profile.name || profile.email.split("@")[0],
            emailVerified: new Date(),
          },
          select: { id: true },
        });
        await tx.oAuthAccount.create({
          data: { userId: user.id, provider: "google", providerUserId: profile.sub },
        });
        return user;
      });
      userId = created.id;
    }
  }

  const user = await db.membershipUser.findUnique({
    where: { id: userId },
    select: { id: true, disabledAt: true, leadId: true, phone: true },
  });
  if (!user || user.disabledAt) return fail(request, "google_failed");

  // If a phone was added since last sign-in but no CRM record was matched then,
  // try again now.
  if (!user.leadId && user.phone) {
    const lead = await findLeadByPhone(user.phone);
    if (lead) {
      const claimed = await db.membershipUser.findUnique({
        where: { leadId: lead.id },
        select: { id: true },
      });
      if (!claimed) {
        await db.membershipUser.update({ where: { id: user.id }, data: { leadId: lead.id } });
      }
    }
  }

  await db.membershipUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user.id, true);

  const destination = stored.redirectTo && stored.redirectTo.startsWith("/") ? stored.redirectTo : "/";
  return NextResponse.redirect(new URL(`/membership${destination === "/" ? "" : destination}`, request.url));
}
