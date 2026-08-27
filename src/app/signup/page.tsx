import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SignupForm } from "@/components/signup-form";
import { GoogleButton } from "@/components/google-button";
import { isGoogleConfigured } from "@/lib/google";
import { getSessionUser } from "@/lib/session";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Create an account" };

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/");

  return (
    <>
      <SiteHeader />
      <main id="main" className="page-main">
        <div className="mp-shell">
          <div className="mp-shell-inner">
            <div className="mp-card">
              <div className="mp-card-head">
                <h1>Create your account</h1>
                <p>Manage your membership, payments and packages in one place.</p>
              </div>

              <SignupForm />

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
