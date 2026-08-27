// Node-side session helpers. Uses next/headers, so this must not be imported
// from the middleware — see src/lib/auth.ts for the Edge-safe half.

import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_PATH,
  SESSION_DEFAULT_SECONDS,
  SESSION_REMEMBER_SECONDS,
  createSessionToken,
  readSessionToken,
} from "@/lib/auth";
import { getDb } from "@/lib/db";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  leadId: string | null;
};

/**
 * Signs the member in. When `remember` is false the cookie is left without a
 * maxAge, so the browser drops it when the window closes.
 */
export async function startSession(userId: string, remember: boolean): Promise<void> {
  const maxAge = remember ? SESSION_REMEMBER_SECONDS : SESSION_DEFAULT_SECONDS;
  const token = await createSessionToken(userId, maxAge);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: SESSION_COOKIE_PATH,
    ...(remember ? { maxAge } : {}),
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_PATH });
}

/** The signed-in member, or null. Also fails closed for disabled accounts. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const user = await getDb().membershipUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, phone: true, leadId: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    leadId: user.leadId,
  };
}
