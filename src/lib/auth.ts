// Shared-password auth gate helpers.
//
// This module is imported by both the Edge middleware and Node server actions,
// so it must stay runtime-agnostic: only Web Crypto (crypto.subtle), TextEncoder,
// and btoa are used. Do not import `next/headers` or any Node-only API here.

export const SESSION_COOKIE = "madar_session";
// Cookie scoped to the app's basePath so it is not sent to other apps on the domain.
export const SESSION_COOKIE_PATH = "/crm";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

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

// Constant-time string comparison to avoid leaking match position via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Checks the submitted password against CRM_PASSWORD. Fails closed if unset. */
export function verifyPassword(password: string): boolean {
  const expected = process.env.CRM_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}

/** Creates a stateless `<expiry>.<hmac>` session token. */
export async function createSessionToken(): Promise<string> {
  const secret = process.env.CRM_AUTH_SECRET;
  if (!secret) throw new Error("CRM_AUTH_SECRET is not configured");
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const signature = await sign(String(expiresAt), secret);
  return `${expiresAt}.${signature}`;
}

/** Verifies a session token's signature and expiry. Fails closed if secret unset. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const secret = process.env.CRM_AUTH_SECRET;
  if (!secret || !token) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expiresAtMs = Number(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return false;

  const expected = await sign(expiresAt, secret);
  return timingSafeEqual(signature, expected);
}
