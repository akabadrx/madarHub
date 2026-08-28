import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { exchangeCodeForProfile, isGoogleConfigured } from "@/lib/google";
import { startSession } from "@/lib/session";
import { linkAccountToLead } from "@/app/checkout-actions";
import { portalUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

function fail(reason: string) {
  return NextResponse.redirect(portalUrl(`/login?reason=${reason}`));
}

/** GET /membership/api/auth/google/callback — completes the Google sign-in. */
export async function GET(request: Request) {
  if (!isGoogleConfigured()) return fail("google_failed");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("google_failed");

  const db = getDb();

  // Consuming the state row here means a replayed callback finds nothing and
  // is rejected, even if the same code is presented twice.
  const stored = await db.oAuthState.findUnique({ where: { state } });
  if (stored) await db.oAuthState.delete({ where: { id: stored.id } });
  if (!stored || stored.expiresAt < new Date()) return fail("google_failed");

  let profile;
  try {
    profile = await exchangeCodeForProfile(code, stored.codeVerifier);
  } catch (error) {
    console.error("[google-callback]", error instanceof Error ? error.message : error);
    return fail("google_failed");
  }

  // An unverified Google address proves nothing about who owns it, and would
  // otherwise be a way to take over an account by its email address.
  if (!profile.emailVerified) return fail("google_failed");

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
      if (existing.disabledAt) return fail("google_failed");
      // Same person, signing in with Google for the first time.
      await db.oAuthAccount.create({
        data: { userId: existing.id, provider: "google", providerUserId: profile.sub },
      });
      userId = existing.id;
    } else {
      // New account straight from Google. It carries no phone number, but the
      // email below is the primary identifier, so the link attempt after this
      // block can still match it to an existing member.
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
  if (!user || user.disabledAt) return fail("google_failed");

  // A Google account carries no phone number, so email is the only identifier
  // available here — and it is the primary one, so a member whose address is on
  // their CRM record is connected on their first sign-in.
  if (!user.leadId) {
    await linkAccountToLead(user.id, profile.email, user.phone);
  }

  await db.membershipUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user.id, true);

  const destination = stored.redirectTo && stored.redirectTo.startsWith("/") ? stored.redirectTo : "/";
  return NextResponse.redirect(portalUrl(destination));
}
