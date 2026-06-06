import { extractIp, hashIp } from '@/lib/audit/hashIp';

/**
 * Derive the per-IP daily rate-limit key for a judge entry point.
 *
 * Extracted from `app/api/judge/route.ts` so the proxy and the
 * extension relay partition callers identically. The `prefix` keeps the
 * two endpoints in SEPARATE daily buckets (`judge:` vs `ext-judge:`) so
 * extension spend and web spend are independently capped and separately
 * observable.
 *
 * Privacy invariants (carried over verbatim from the proxy — see
 * `lib/audit/hashIp.ts`):
 *   - When `IP_HASH_PEPPER` is set, the key embeds a SHA-256 hash of the
 *     IP. This is safe to persist in KV.
 *   - When the pepper is absent, `hashIp` returns null. We fall back to
 *     the RAW IP so callers don't all collapse into one global bucket,
 *     but we flag `memoryOnly` so the caller routes the counter through
 *     volatile process memory only — a raw IP (tiny IPv4 keyspace) must
 *     never be written to persistent KV.
 *   - With no client IP at all, we use a shared `no-ip` partition.
 *   - `keyShape` is the loggable shape (`hash` | `raw` | `no-ip`); the
 *     full key is NEVER safe to log when it embeds a raw IP.
 */
export interface JudgeRateKey {
  /** Key passed to `consumeJudgeRateLimit`. May embed a raw IP. */
  rateLimitKey: string;
  /** True when the key embeds a raw IP (pepper unset) or there's no IP —
   * force the in-memory backend so a raw IP is never persisted to KV. */
  memoryOnly: boolean;
  /** Loggable partition shape; safe to emit (the full key is not). */
  keyShape: 'hash' | 'raw' | 'no-ip';
}

export function deriveJudgeRateKey(headers: Headers, prefix: string): JudgeRateKey {
  const ip = extractIp(headers);
  const hashed = ip ? hashIp(ip) : null;
  const ipKey = hashed ? `hash:${hashed}` : ip ? `raw:${ip}` : 'no-ip';
  const keyShape: JudgeRateKey['keyShape'] = hashed ? 'hash' : ip ? 'raw' : 'no-ip';
  return {
    rateLimitKey: `${prefix}:${ipKey}`,
    // memoryOnly when the pepper is missing (raw IP) OR there's no IP at all.
    memoryOnly: hashed === null,
    keyShape,
  };
}
