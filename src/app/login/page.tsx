import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LoginForm } from "@/components/login-form";
import { GoogleButton } from "@/components/google-button";
import { isGoogleConfigured } from "@/lib/google";
import { getSessionUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Log in" };

export const dynamic = "force-dynamic";

function safeFrom(value: unknown): string {
  const raw = typeof value === "string" ? value : "/";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const from = safeFrom(params.from);

  // Someone already signed in has no reason to see this page.
  if (await getSessionUser()) redirect(from);

  const notice =
    params.reason === "google_failed"
      ? "We could not complete the Google sign-in. Please try again, or use your email and password."
      : params.reason === "google_no_account"
        ? "No Madar Hub account uses that Google address yet. Create an account first, then Google sign-in will work."
        : null;

  return (
    <>
      <SiteHeader />
      <main id="main" className="page-main">
        <div className="mp-shell">
          <div className="mp-shell-inner">
            <div className="mp-card">
              <div className="mp-card-head">
                <h1>Welcome back</h1>
                <p>Log in to manage your Madar Hub membership.</p>
              </div>

              {notice ? (
                <p className="mp-alert info" role="status" style={{ marginBottom: 20 }}>
                  {notice}
                </p>
              ) : null}

              <LoginForm from={from} />

              {isGoogleConfigured() ? (
                <>
                  <div className="mp-divider">or</div>
                  <GoogleButton intent="login" from={from} />
                </>
              ) : null}

              <div className="mp-card-foot">
                Do not have an account yet?
                <a className="button outline" href="/membership/signup">
                  Create an account
                </a>
              </div>
            </div>

            <a className="mp-back" href={siteUrl("index.html")}>
              &larr; Back to madarorbit.com
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
