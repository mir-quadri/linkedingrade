/**
 * Daily per-key rate limiter for the judge proxy. Keyed by IP hash
 * (callers are responsible for hashing — see `lib/audit/hashIp.ts`)
 * OR by extension client id, depending on the caller.
 *
 * Storage:
 *   - When Vercel KV is provisioned, increments a daily counter under
 *     `judge:rate:<key>:<YYYY-MM-DD>` with a 25-hour TTL (one day plus
 *     buffer so the key naturally rotates).
 *   - When KV isn't available — local dev, missing env — falls back to
 *     an in-memory Map parked on `globalThis`, identical pattern to
 *     `auditStore.ts`. Per-instance limit only, but enough to keep
 *     local dev honest.
 *
 * The contract: `consume(key, limit)` increments and returns whether
 * the call is allowed. Treat a thrown KV error as "allow" — better to
 * over-serve than to fail-closed and break the audit.
 */

interface KvClient {
  incr(key: string): Promise<number | unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

const TTL_SECONDS = 25 * 60 * 60;

interface RateLimitGlobal {
  __linkedinGradeJudgeRate?: Map<string, number>;
}

function inMemoryMap(): Map<string, number> {
  const g = globalThis as unknown as RateLimitGlobal;
  if (!g.__linkedinGradeJudgeRate) {
    g.__linkedinGradeJudgeRate = new Map<string, number>();
  }
  return g.__linkedinGradeJudgeRate;
}

let cachedKv: KvClient | null | undefined = undefined;
let kvWarned = false;

async function getKv(): Promise<KvClient | null> {
  if (cachedKv !== undefined) return cachedKv;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    if (!kvWarned) {
      console.warn(
        '[judgeRateLimit] KV_REST_API_URL not set; using in-memory rate limit (per-instance).',
      );
      kvWarned = true;
    }
    cachedKv = null;
    return null;
  }
  try {
    const mod = (await import('@vercel/kv')) as { kv: KvClient };
    cachedKv = mod.kv;
    return cachedKv;
  } catch (err) {
    if (!kvWarned) {
      console.warn(
        `[judgeRateLimit] @vercel/kv unavailable (${(err as Error).message}); using in-memory rate limit.`,
      );
      kvWarned = true;
    }
    cachedKv = null;
    return null;
  }
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Current count after this call. */
  count: number;
  /** The limit applied. */
  limit: number;
  /** Implementation that handled the check, for logging visibility. */
  backend: 'kv' | 'memory' | 'fail-open';
}

export interface ConsumeOptions {
  /**
   * Force the in-memory fallback even when KV is configured. The route
   * passes this when the rate-limit key embeds a raw IP (because
   * `IP_HASH_PEPPER` is unset): raw IPs are fine in volatile process
   * memory but must not be written to persistent KV (Codex Round 4 P2;
   * same contract as `lib/audit/hashIp.ts`, which returns `null` rather
   * than persist an un-peppered hash of the tiny IPv4 keyspace).
   */
  memoryOnly?: boolean;
}

/**
 * Try to consume a request slot for `key`. Returns whether the call is
 * allowed and the post-increment count. The `nowYmd` arg is the date
 * key (YYYY-MM-DD UTC); callers normally don't pass it, but tests do.
 */
export async function consumeJudgeRateLimit(
  key: string,
  limit: number,
  nowYmd?: string,
  options: ConsumeOptions = {},
): Promise<RateLimitDecision> {
  if (limit <= 0) return { allowed: false, count: 0, limit, backend: 'fail-open' };
  const ymd = nowYmd ?? new Date().toISOString().slice(0, 10);
  const fullKey = `judge:rate:${key}:${ymd}`;
  const kv = options.memoryOnly ? null : await getKv();
  if (kv) {
    try {
      const incrResult = await kv.incr(fullKey);
      const count = typeof incrResult === 'number' ? incrResult : Number(incrResult);
      // Only set the TTL on first hit. Setting it every time is harmless
      // but wastes a round-trip.
      if (Number.isFinite(count) && count === 1) {
        await kv.expire(fullKey, TTL_SECONDS).catch(() => undefined);
      }
      if (!Number.isFinite(count)) {
        return { allowed: true, count: 0, limit, backend: 'fail-open' };
      }
      return { allowed: count <= limit, count, limit, backend: 'kv' };
    } catch (err) {
      console.error(
        `[judgeRateLimit] kv error (${(err as Error).message}); failing open for ${key}`,
      );
      return { allowed: true, count: 0, limit, backend: 'fail-open' };
    }
  }
  const map = inMemoryMap();
  const prev = map.get(fullKey) ?? 0;
  const count = prev + 1;
  map.set(fullKey, count);
  return { allowed: count <= limit, count, limit, backend: 'memory' };
}

/**
 * Test-only reset hook. The in-memory map is wiped; the cached KV
 * client decision is cleared so the next call re-reads env. Mirrors
 * `__resetAuditStoreForTests`.
 */
export function __resetJudgeRateLimitForTests(): void {
  cachedKv = undefined;
  kvWarned = false;
  const g = globalThis as unknown as RateLimitGlobal;
  g.__linkedinGradeJudgeRate = new Map<string, number>();
}
