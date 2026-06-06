import { createHash } from 'node:crypto';

/**
 * SHA-256 hash an IP with a static pepper from `IP_HASH_PEPPER`. The pepper
 * prevents trivial reverse-lookup of common IPs from the stored hash. We
 * never persist the raw IP. When the pepper isn't configured we return
 * `null` rather than hash without it — an un-peppered hash of a tiny
 * keyspace (IPv4) is functionally equivalent to storing the IP itself.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const pepper = process.env.IP_HASH_PEPPER;
  if (!pepper) return null;
  return createHash('sha256').update(`${pepper}:${ip}`).digest('hex');
}

/**
 * Extract the originating client IP from a Next.js request. Selection
 * order is by TRUST level — Vercel-stamped headers first, client-
 * supplied ones never. Otherwise an authenticated caller (curl with
 * the proxy secret, the future browser extension, a misconfigured
 * local proxy) could spoof `x-forwarded-for` to:
 *
 *   - Fan out across the `/api/judge` per-IP rate-limit buckets and
 *     exhaust the documented per-IP daily cap arbitrarily.
 *   - Choose which IP gets hashed onto the audit record at the
 *     `/api/audit/email` consent step.
 *
 * Selection:
 *   1. `x-vercel-forwarded-for` chain[0] — Vercel-set; the edge
 *      strips any client-supplied value before forwarding.
 *   2. `x-real-ip` — Vercel-set single value.
 *   3. nothing → `null` → callers degrade to no-IP behaviour.
 *
 * `x-forwarded-for` is DELIBERATELY not in the trust chain. On Vercel
 * the edge APPENDS the real IP to whatever the client sent, so
 * `chain[0]` is attacker-controlled. On non-Vercel hosts the header
 * is unreliable in both directions.
 */
export function extractIp(headers: Headers): string | null {
  const vercelFwd = headers.get('x-vercel-forwarded-for');
  if (vercelFwd) {
    const first = vercelFwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip');
}
