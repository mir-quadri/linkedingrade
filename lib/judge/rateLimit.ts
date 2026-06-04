import { RATE_LIMIT_PER_DAY } from './config';

/**
 * Per-IP/day rate limiter for the judge proxy. Mirrors the storage strategy in
 * `lib/storage/auditStore.ts`: a KV-backed implementation for production
 * (correct across serverless instances) with an in-memory fallback so the
 * endpoint still works locally / before KV is provisioned.
 *
 * The key is bucketed by UTC day, so the limit is a rolling daily quota that
 * resets at 00:00 UTC. Counters carry a ~25h TTL so stale buckets self-evict.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Requests used in the current window (after this hit). */
  count: number;
  /** The per-day cap. */
  limit: number;
}

export interface RateLimiter {
  /** Record one request from `id` and report whether it's within the cap. */
  hit(id: string): Promise<RateLimitResult>;
}

const TTL_SECONDS = 60 * 60 * 25; // 25h — comfortably past the daily bucket
const TTL_MS = TTL_SECONDS * 1000;

/** UTC-day bucket key, e.g. `judge:rl:<id>:2026-06-04`. */
export function bucketKey(id: string, now: number): string {
  const day = new Date(now).toISOString().slice(0, 10);
  return `judge:rl:${id}:${day}`;
}

interface Counter {
  count: number;
  expiresAt: number;
}

interface RateLimitGlobal {
  __linkedinGradeJudgeRateLimit?: Map<string, Counter>;
}

function inMemoryMap(): Map<string, Counter> {
  const g = globalThis as unknown as RateLimitGlobal;
  if (!g.__linkedinGradeJudgeRateLimit) {
    g.__linkedinGradeJudgeRateLimit = new Map<string, Counter>();
  }
  return g.__linkedinGradeJudgeRateLimit;
}

class InMemoryRateLimiter implements RateLimiter {
  async hit(id: string): Promise<RateLimitResult> {
    const now = Date.now();
    const map = inMemoryMap();
    // Opportunistic prune so expired buckets don't accumulate.
    for (const [k, c] of map) {
      if (c.expiresAt <= now) map.delete(k);
    }
    const key = bucketKey(id, now);
    const existing = map.get(key);
    const count = (existing?.count ?? 0) + 1;
    map.set(key, { count, expiresAt: now + TTL_MS });
    return { allowed: count <= RATE_LIMIT_PER_DAY, count, limit: RATE_LIMIT_PER_DAY };
  }
}

/** Subset of `@vercel/kv` we use — atomic INCR plus a first-write EXPIRE. */
interface KvClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

class KvRateLimiter implements RateLimiter {
  constructor(private kv: KvClient) {}

  async hit(id: string): Promise<RateLimitResult> {
    const key = bucketKey(id, Date.now());
    const count = await this.kv.incr(key);
    // Set the TTL only on the first increment so the window is anchored to the
    // first request of the day, not refreshed on every hit.
    if (count === 1) {
      await this.kv.expire(key, TTL_SECONDS);
    }
    return { allowed: count <= RATE_LIMIT_PER_DAY, count, limit: RATE_LIMIT_PER_DAY };
  }
}

let cached: RateLimiter | null = null;
let warned = false;

/**
 * Singleton accessor. KV-backed when `KV_REST_API_URL`/`KV_REST_API_TOKEN`
 * are set; otherwise an in-memory limiter (per-instance, so the cap is only
 * approximate across a fan-out of cold serverless instances) with a one-time
 * warning. Same fallback contract as `getAuditStore`.
 */
export async function getRateLimiter(): Promise<RateLimiter> {
  if (cached) return cached;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const mod = (await import('@vercel/kv')) as { kv: KvClient };
      cached = new KvRateLimiter(mod.kv);
      return cached;
    } catch (err) {
      if (!warned) {
        console.warn(
          `[judge/rateLimit] @vercel/kv failed to load (${(err as Error).message}); falling back to in-memory limiter`,
        );
        warned = true;
      }
    }
  } else if (!warned) {
    console.warn(
      '[judge/rateLimit] KV_REST_API_URL not set; using in-memory rate limiter (per-instance, resets on cold start). Provision Vercel KV for a correct cross-instance cap.',
    );
    warned = true;
  }
  cached = new InMemoryRateLimiter();
  return cached;
}

/** Test-only reset hook — clears the singleton and the in-memory buckets. */
export function __resetRateLimiterForTests(): void {
  cached = null;
  warned = false;
  const g = globalThis as unknown as RateLimitGlobal;
  g.__linkedinGradeJudgeRateLimit = new Map<string, Counter>();
}
