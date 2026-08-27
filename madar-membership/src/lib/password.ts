// Password hashing. Node runtime only — never import this from the middleware.
//
// Uses scrypt from node:crypto rather than a third-party hash library: it is
// memory-hard, built in, and needs no native build step on the VPS.

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// N=2^15 keeps a hash near ~100ms on the current VPS, which is a sensible
// trade between login latency and brute-force cost. N, r and p are stored in
// the hash string so they can be raised later without invalidating existing
// passwords.
//
// maxmem must be set explicitly. scrypt needs 128 * N * r bytes, which here is
// exactly 32 MB — the same as Node's default cap — and the check is a strict
// comparison against the allocation plus internal overhead, so the default
// rejects these parameters outright with ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
// Doubling the ceiling leaves headroom without letting a bad stored value
// request unbounded memory. It is not part of the hash string: it is a local
// guard rail, not a property of the hash.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: SCRYPT_MAXMEM };
const KEY_LENGTH = 64;

export { MIN_PASSWORD_LENGTH } from "@/lib/password-constants";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
    return false;
  }
  // A stored hash asking for more memory than the ceiling would throw rather
  // than return false, turning a bad row into a 500 on the login page.
  if (128 * params.N * params.r > SCRYPT_MAXMEM) return false;

  const expected = Buffer.from(hashB64, "base64url");
  const derived = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(saltB64, "base64url"),
    expected.length,
    params,
  );
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** sha256, for storing password-reset and OAuth tokens without the raw value. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
