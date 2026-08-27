import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ForgotPasswordForm } from "@/components/simple-auth-form";
import { requestPasswordReset } from "@/app/auth-actions";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="page-main">
        <div className="mp-shell">
          <div className="mp-shell-inner">
            <div className="mp-card">
              <div className="mp-card-head">
                <h1>Forgot your password?</h1>
                <p>Enter your email address and we will send you a link to set a new one.</p>
              </div>

              <ForgotPasswordForm action={requestPasswordReset} />

              <div className="mp-card-foot">
                Remembered it after all?
                <a className="button outline" href="/membership/login">
                  Back to log in
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
