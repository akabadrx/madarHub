import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProfileForm } from "@/components/profile-form";
import { getSessionUser } from "@/lib/session";
import { getLead } from "@/lib/crm";

export const metadata: Metadata = { title: "Your details" };

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lead = user.leadId ? await getLead(user.leadId) : null;

  return (
    <>
      <SiteHeader signedIn />
      <main id="main" className="page-main">
        <div className="mp-dash">
          <div className="mp-dash-head">
            <div>
              <h1>Your details</h1>
              <p>
                <a href="/membership">&larr; Back to my membership</a>
              </p>
            </div>
          </div>

          <div className="mp-profile">
            <section className="mp-panel">
              <h2>Account</h2>
              <ProfileForm fullName={user.fullName} phone={user.phone} email={user.email} />
            </section>

            <section className="mp-panel">
              <h2>Membership link</h2>
              {lead ? (
                <>
                  <span className="mp-badge active">Connected</span>
                  <p className="mp-stat-sub">
                    This account is connected to the Madar Hub record for{" "}
                    <strong>{lead.name || lead.phone}</strong>, so your status and payment history
                    show on your dashboard.
                  </p>
                </>
              ) : (
                <>
                  <span className="mp-badge none">Not connected yet</span>
                  <p className="mp-stat-sub">
                    {user.phone
                      ? "We have not found a Madar Hub membership under this phone number yet. If you already use the space, message us on WhatsApp and we will connect it."
                      : "Add your phone number to connect this account to your Madar Hub membership. You will also need it to pay online."}
                  </p>
                  <p className="mp-stat-sub" style={{ marginTop: 12 }}>
                    <a
                      className="button outline small"
                      href="https://wa.me/250783662543?text=Hello%20Madar%20Hub%2C%20please%20connect%20my%20membership%20to%20my%20online%20account"
                    >
                      Ask us on WhatsApp
                    </a>
                  </p>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
