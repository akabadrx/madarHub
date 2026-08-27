// Google sign-in, as a plain authorization-code flow with PKCE.
//
// Hand-rolled rather than pulled from an auth library: this app needs exactly
// one provider, and the CRM next door already establishes the pattern of
// hand-signed sessions. The button is hidden entirely when the credentials
// below are unset, so the portal runs fine before Google is configured.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function requireConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and NEXT_PUBLIC_APP_URL must be set");
  }
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/auth/google/callback` };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomUrlSafe(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function buildAuthorizationUrl(state: string, codeChallenge: string): string {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    // Google only returns the email as verified after a fresh consent for some
    // account types; prompt=select_account also avoids silently reusing the
    // wrong Google account on a shared machine.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export async function exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile> {
  const { clientId, clientSecret, redirectUri } = requireConfig();

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed with ${tokenResponse.status}`);
  }

  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!accessToken) throw new Error("Google token response contained no access token");

  const profileResponse = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileResponse.ok) {
    throw new Error(`Google userinfo failed with ${profileResponse.status}`);
  }

  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!profile.sub || !profile.email) {
    throw new Error("Google profile was missing an id or email");
  }

  return {
    sub: profile.sub,
    email: profile.email.toLowerCase(),
    emailVerified: profile.email_verified === true,
    name: profile.name ?? null,
  };
}
