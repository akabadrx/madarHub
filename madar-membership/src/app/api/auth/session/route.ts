import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /membership/api/auth/session — tells the static marketing pages whether
 * the visitor is signed in, so their header can show "My Account" instead of
 * "Login / Sign up". The session cookie is httpOnly and scoped to /membership,
 * so those pages cannot read it themselves. Only a boolean leaves the server.
 */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json(
    { signedIn: Boolean(user) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
