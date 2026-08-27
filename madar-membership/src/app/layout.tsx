import type { Metadata } from "next";
import { SITE_ORIGIN } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Membership | Madar Hub",
    template: "%s | Madar Hub",
  },
  description:
    "Manage your Madar Hub membership: check your subscription status, see when your next payment is due, and review your payment history.",
  // The portal is an account area, not a page for search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          The marketing site's own stylesheet, served from the same domain in
          production. Linking it rather than copying it means the portal picks
          up brand changes the moment the static site is redeployed, and there
          is only ever one definition of the Madar Hub look.
        */}
        <link rel="stylesheet" href={`${SITE_ORIGIN}/assets/styles.css?v=20260712`} />
        <link rel="icon" href={`${SITE_ORIGIN}/assets/favicon.svg`} type="image/svg+xml" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
