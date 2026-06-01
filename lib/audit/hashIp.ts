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
 * Extract the originating client IP from a Next.js request. Prefers
 * `x-forwarded-for` (Vercel sets this) and falls back to `x-real-ip`.
 */
export function extractIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip');
}
