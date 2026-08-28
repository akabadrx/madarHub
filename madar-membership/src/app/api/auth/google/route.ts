import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { portalUrl } from "@/lib/site";
import {
  buildAuthorizationUrl,
  isGoogleConfigured,
  pkceChallenge,
  randomUrlSafe,
} from "@/lib/google";

export const dynamic = "force-dynamic";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function safeFrom(value: string | null): string {
  if (!value) return "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** GET /membership/api/auth/google — starts the Google sign-in redirect. */
export async function GET(request: Request) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(portalUrl("/login?reason=google_failed"));
  }

  const url = new URL(request.url);
  const state = randomUrlSafe();
  const codeVerifier = randomUrlSafe(48);

  // State and verifier live in the database rather than a cookie so the
  // callback can validate them even when the browser drops third-party
  // cookies on the way back from Google.
  const db = getDb();
  await db.oAuthState.create({
    data: {
      state,
      codeVerifier,
      redirectTo: safeFrom(url.searchParams.get("from")),
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });

  // Opportunistic sweep; these rows are worthless once expired.
  await db.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  return NextResponse.redirect(buildAuthorizationUrl(state, await pkceChallenge(codeVerifier)));
}
