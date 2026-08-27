"use client";

import { useEffect, useState } from "react";
import { SITE_ORIGIN, WHATSAPP_URL, siteUrl } from "@/lib/site";

// Mirrors the static site's header markup exactly so the shared stylesheet
// styles it identically, and reimplements the two behaviours from
// assets/script.js that the static pages get for free: the scrolled state and
// the mobile nav toggle.

const NAV_LINKS = [
  { href: "index.html", label: "Home" },
  { href: "about.html", label: "About Us" },
  { href: "pricing.html", label: "Pricing" },
  { href: "events.html", label: "Events" },
  { href: "insights/index.html", label: "Insights" },
  { href: "badr-academy.html", label: "Badr Academy" },
  { href: "contact.html", label: "Contact" },
];

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("nav-open", navOpen);
    return () => document.body.classList.remove("nav-open");
  }, [navOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="header-inner">
        <a className="brand" href={siteUrl("index.html")} aria-label="Madar Hub home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="brand-logo"
            src={`${SITE_ORIGIN}/assets/madar-hub-logo-horizontal.svg`}
            alt="Madar Hub"
            width={180}
            height={48}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="brand-logo brand-logo-dark"
            src={`${SITE_ORIGIN}/assets/madar-hub-logo-horizontal-dark-bg.svg`}
            alt="Madar Hub"
            width={180}
            height={48}
          />
        </a>
        <nav className="site-nav" aria-label="Primary navigation" onClick={() => setNavOpen(false)}>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={siteUrl(link.href)}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          {signedIn ? (
            <a className="button outline small membership-link" href="/membership">
              My Account
            </a>
          ) : (
            <a className="button outline small membership-link" href="/membership/login">
              Login
            </a>
          )}
          <a className="button primary small" href={WHATSAPP_URL}>
            Book a Visit
          </a>
          <button
            className="nav-toggle"
            type="button"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className="nav-toggle-lines" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
