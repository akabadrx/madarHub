import { SITE_ORIGIN, WHATSAPP_URL, siteUrl } from "@/lib/site";

// Same markup as the static site's footer so the shared stylesheet applies.

const SERVICES = [
  ["coworking-space-kigali.html", "Coworking Space"],
  ["fixed-desk-kigali.html", "Fixed Desk"],
  ["virtual-office-business-address-kigali.html", "Virtual Address"],
  ["rdb-business-address-kigali.html", "RDB Address Support"],
  ["private-office-team-room-kigali.html", "Private Team Room"],
  ["meeting-room-kigali.html", "Meeting Room"],
  ["training-room-workshop-venue-kigali.html", "Training Room"],
  ["study-space-kigali.html", "Study Space"],
];

const QUICK_LINKS = [
  ["about.html", "About Us"],
  ["pricing.html", "Pricing"],
  ["events.html", "Events"],
  ["insights/index.html", "Insights"],
  ["badr-academy.html", "Badr Academy"],
  ["contact.html", "Contact"],
];

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div>
            <a className="brand" href={siteUrl("index.html")} aria-label="Madar Hub home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="footer-brand-logo"
                src={`${SITE_ORIGIN}/assets/madar-hub-logo-horizontal-dark-bg.svg`}
                alt="Madar Hub"
                width={170}
                height={40}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="footer-brand-logo footer-brand-logo-light"
                src={`${SITE_ORIGIN}/assets/madar-hub-logo-horizontal.svg`}
                alt="Madar Hub"
                width={170}
                height={40}
              />
            </a>
            <p style={{ marginTop: 16 }}>
              A focused coworking and business address space in Kimironko, Kigali.
            </p>
          </div>
          <div>
            <h3>Services</h3>
            <ul>
              {SERVICES.map(([href, label]) => (
                <li key={href}>
                  <a href={siteUrl(href)}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Quick links</h3>
            <ul>
              {QUICK_LINKS.map(([href, label]) => (
                <li key={href}>
                  <a href={siteUrl(href)}>{label}</a>
                </li>
              ))}
              <li>
                <a href="/membership">My Membership</a>
              </li>
            </ul>
          </div>
          <div>
            <h3>Contact</h3>
            <ul>
              <li>
                <a href="mailto:contact@madarorbit.com">contact@madarorbit.com</a>
              </li>
              <li>
                <a href={WHATSAPP_URL}>0783 662 543</a>
              </li>
              <li>KG 42 Street, Kimironko, Gasabo, Kigali, Rwanda</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; Madar Hub. All rights reserved.</p>
          <p>madarorbit.com</p>
        </div>
      </div>
    </footer>
  );
}
