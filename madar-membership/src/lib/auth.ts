// Member session helpers.
//
// Imported by both the Edge middleware (src/proxy.ts) and Node server actions,
// so this module must stay runtime-agnostic: Web Crypto, TextEncoder and btoa
// only. Do not import `next/headers`, `node:crypto`, or any Node-only API here.
//
// The secret is MEMBER_AUTH_SECRET, deliberately separate from the CRM's
// CRM_AUTH_SECRET, so a staff session can never validate as a member session
// (or the reverse) even though both apps sit on the same domain.

export const SESSION_COOKIE = "madar_member_session";
// Scoped to this app's basePath so the cookie is never sent to /crm or the
// static marketing pages.
export const SESSION_COOKIE_PATH = "/membership";

/** "Keep me logged in" duration. */
export const SESSION_REMEMBER_SECONDS = 60 * 60 * 24 * 30; // 30 days
/** Duration when the box is left unchecked; also a session cookie (no maxAge). */
export const SESSION_DEFAULT_SECONDS = 60 * 60 * 12; // 12 hours

const encoder = new TextEncoder();

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bufferToBase64Url(signature);
}

/** Constant-time comparison, so a mismatch position is not leaked by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Creates a `<userId>.<expiry>.<hmac>` session token.
 *
 * The signature covers the user id as well as the expiry. Signing the expiry
 * alone would let anyone swap in another member's id and read their account.
 */
export async function createSessionToken(userId: string, maxAgeSeconds: number): Promise<string> {
  const secret = process.env.MEMBER_AUTH_SECRET;
  if (!secret) throw new Error("MEMBER_AUTH_SECRET is not configured");
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

/**
 * Verifies a session token and returns the member's user id, or null.
 * Fails closed when the secret is unset.
 */
export async function readSessionToken(token: string | undefined | null): Promise<string | null> {
  const secret = process.env.MEMBER_AUTH_SECRET;
  if (!secret || !token) return null;

  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);

  const separator = payload.indexOf(".");
  if (separator <= 0) return null;

  const userId = payload.slice(0, separator);
  const expiresAtMs = Number(payload.slice(separator + 1));
  if (!userId || !Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return null;

  const expected = await sign(payload, secret);
  return timingSafeEqual(signature, expected) ? userId : null;
}
