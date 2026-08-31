/**
 * CORS for the endpoints the public marketing site calls from the browser.
 *
 * The pricing page is also reachable on www.madarorbit.com, which 301s to the
 * canonical host. A browser treats that as a cross-origin redirect and aborts
 * the request ("Failed to fetch") unless these headers come back, so the
 * marketing-site origins are allowed explicitly.
 */
const ALLOWED_ORIGINS = new Set([
  "https://madarorbit.com",
  "https://www.madarorbit.com",
]);

export function corsHeaders(req: Request, methods = "POST, OPTIONS"): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
