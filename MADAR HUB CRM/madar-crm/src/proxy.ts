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
  // Protect everything except the login page, the cron routes (which have
  // their own bearer-token auth), the public Pesapal and MoMo
  // checkout/callback/IPN/status routes (called by customers and by the
  // payment providers themselves, not logged-in staff), the MoMo sandbox
  // provisioning helper (bearer CRON_SECRET, and sandbox-only), the internal
  // server-to-server routes (guarded by INTERNAL_API_SECRET), and
  // framework/static assets.
  matcher: [
    "/((?!login|api/notifications/daily-digest|api/notifications/payment-reminders|api/notifications/member-reminders|api/cron/pesapal-reconcile|api/cron/momo-reconcile|api/public/pesapal|api/public/momo|api/momo/provision-sandbox|api/internal/|_next/static|_next/image|favicon.ico).*)",
  ],
};
