import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  // Redirect to login, remembering where the user was headed.
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  const from = request.nextUrl.pathname;
  if (from && from !== "/") {
    loginUrl.searchParams.set("from", from);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Protect everything except the login page, the cron digest route (which has
  // its own bearer-token auth), the public Pesapal checkout/callback/IPN routes
  // (called by customers and by Pesapal itself, not logged-in staff), and
  // framework/static assets.
  matcher: [
    "/((?!login|api/notifications/daily-digest|api/public/pesapal|_next/static|_next/image|favicon.ico).*)",
  ],
};
