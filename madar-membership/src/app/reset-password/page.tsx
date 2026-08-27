import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ResetPasswordForm } from "@/components/simple-auth-form";
import { resetPassword } from "@/app/auth-actions";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Choose a new password" };

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <>
      <SiteHeader />
      <main id="main" className="page-main">
        <div className="mp-shell">
          <div className="mp-shell-inner">
            <div className="mp-card">
              <div className="mp-card-head">
                <h1>Choose a new password</h1>
                <p>Pick something you have not used on another site.</p>
              </div>

              {token ? (
                <ResetPasswordForm action={resetPassword} token={token} />
              ) : (
                <>
                  <p className="mp-alert error" role="alert">
                    This link is missing its reset code. Request a new link and open it directly from
                    your email.
                  </p>
                  <div className="mp-card-foot">
                    <a className="button outline" href="/membership/forgot-password">
                      Request a new link
                    </a>
                  </div>
                </>
              )}
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
