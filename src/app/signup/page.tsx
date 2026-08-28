import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SignupForm } from "@/components/signup-form";
import { GoogleButton } from "@/components/google-button";
import { isGoogleConfigured } from "@/lib/google";
import { getSessionUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { readInvite } from "@/lib/invite";

export const metadata: Metadata = { title: "Create an account" };

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  if (await getSessionUser()) redirect("/");

  const { invite } = await searchParams;
  const invited = await readInvite(invite);

  return (
    <>
      <SiteHeader />
      <main id="main" className="page-main">
        <div className="mp-shell">
          <div className="mp-shell-inner">
            <div className="mp-card">
              <div className="mp-card-head">
                <h1>{invited ? "Welcome to Madar Hub" : "Create your account"}</h1>
                <p>
                  {invited
                    ? "Your membership is ready to connect — just choose a password."
                    : "Manage your membership, payments and packages in one place."}
                </p>
              </div>

              {invite && !invited ? (
                <p className="mp-alert info" role="status" style={{ marginBottom: 20 }}>
                  That invite link has expired or has already been used. You can still create an
                  account below, or ask us on WhatsApp for a new link.
                </p>
              ) : null}

              <SignupForm
                invite={invited ? invite : undefined}
                prefill={invited ? { fullName: invited.name, phone: invited.phone } : undefined}
              />

              {isGoogleConfigured() ? (
                <>
                  <div className="mp-divider">or</div>
                  <GoogleButton intent="signup" />
                </>
              ) : null}

              <div className="mp-card-foot">
                Already have an account?
                <a className="button outline" href="/membership/login">
                  Log in
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
