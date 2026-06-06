/**
 * Shared CORS helpers for the judge entry points.
 *
 * Browser callers (the Chrome extension) issue a CORS preflight before
 * the POST when the content-type is `application/json`. These helpers
 * keep the allow-origin logic identical between the secret-authenticated
 * proxy (`/api/judge`) and the secretless extension relay
 * (`/api/extension-judge`), each of which passes its OWN allow-list:
 *
 *   - `/api/judge` allows the site origin + extension id (JUDGE_ALLOWED_ORIGINS).
 *   - `/api/extension-judge` allows ONLY the extension origin.
 *
 * CORS is browser-enforced and therefore spoofable by non-browser
 * clients. On the proxy it's purely a read-gate layered on top of the
 * `X-Judge-Auth` secret. On the secretless relay it's the only origin
 * gate, backed by the per-IP rate limit + input caps — an accepted MVP
 * tradeoff (see the extension-judge brief).
 */

/** Parse a comma-separated origin allow-list from an env value. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when `origin` is present and on the allow-list. */
export function isOriginAllowed(origin: string | null, allowed: string[]): origin is string {
  return origin !== null && allowed.includes(origin);
}

/**
 * Attach `Access-Control-Allow-Origin` when the request origin is
 * allowed. Server-to-server callers (no `Origin`) get no extra headers —
 * they don't need them, and `Access-Control-Allow-Origin: *` would
 * weaken the contract. Returns the same response for chaining.
 */
export function withCorsHeaders(
  response: Response,
  origin: string | null,
  allowed: string[],
): Response {
  if (isOriginAllowed(origin, allowed)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

/**
 * Build the 204 preflight response. An allowed origin gets the permissive
 * headers; an unknown origin gets a 204 with NO `Access-Control-Allow-
 * Origin`, which the browser treats as a CORS failure and surfaces to the
 * JS caller. `allowHeaders` differs per endpoint (the proxy permits
 * `X-Judge-Auth`; the secretless relay permits only `Content-Type`).
 */
export function buildPreflightResponse(
  origin: string | null,
  allowed: string[],
  allowHeaders: string,
): Response {
  const headers: Record<string, string> = {
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (isOriginAllowed(origin, allowed)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = allowHeaders;
  }
  return new Response(null, { status: 204, headers });
}
