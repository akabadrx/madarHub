// The static marketing site this app has to blend into.
//
// In production both live on madarorbit.com, so an empty origin keeps the
// stylesheet, logos and nav links same-origin. In local dev, point
// NEXT_PUBLIC_SITE_ORIGIN at the live site so the pages still look right.

export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "";

/** A URL on the marketing site, e.g. siteUrl("pricing.html"). */
export function siteUrl(path: string): string {
  return `${SITE_ORIGIN}/${path.replace(/^\//, "")}`;
}

export const WHATSAPP_NUMBER = "250783662543";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;
