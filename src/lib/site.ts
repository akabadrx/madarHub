// The static marketing site this app has to blend into.
//
// In production both live on madarorbit.com, so an empty origin keeps the
// stylesheet, logos and nav links same-origin. In local dev, point
// NEXT_PUBLIC_SITE_ORIGIN at the live site so the pages still look right.

export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "";

/**
 * Cache-busting version on the marketing site's stylesheet. It must match the
 * `?v=` the static pages use, or the portal and the rest of the site can end up
 * on two different versions of the same CSS. Bump both together.
 */
export const SITE_STYLES_VERSION = "20260828";

/** A URL on the marketing site, e.g. siteUrl("pricing.html"). */
export function siteUrl(path: string): string {
  return `${SITE_ORIGIN}/${path.replace(/^\//, "")}`;
}

export const WHATSAPP_NUMBER = "250783662543";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

/**
 * Absolute URL for a page in this portal.
 *
 * Redirects must not be built from `request.url`: behind PM2 the standalone
 * server reports its bind address, so a redirect built that way points at
 * http://0.0.0.0:3201 and dies in the browser. The configured public URL is the
 * only reliable source.
 */
export function portalUrl(path = "/"): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://madarorbit.com/membership").replace(/\/$/, "");
  const suffix = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
