/**
 * Cost + abuse controls for the judge proxy. All first-class constants live
 * here so the caps are visible and tunable in one place.
 */

/**
 * Current Sonnet model string. The judge runs on Sonnet (not Opus) — it's a
 * high-volume, cost-per-audit call, and Sonnet is the right speed/cost point.
 * Exact ID, no date suffix.
 */
export const JUDGE_MODEL = 'claude-sonnet-4-6';

/**
 * Hard ceiling on output tokens per judge call. Bounds the worst-case output
 * cost regardless of how many questions are batched. The judge returns terse
 * structured verdicts, so this is generous headroom, not a target.
 */
export const MAX_TOKENS = 1024;

/**
 * Per-IP requests allowed per UTC day. The judge is the only paid hop in the
 * audit, so this is the primary spend guardrail against a single abuser.
 */
export const RATE_LIMIT_PER_DAY = 50;

/**
 * Wall-clock timeout for the upstream Claude call. On expiry the proxy returns
 * `{ ok: false, reason: 'upstream_timeout' }` (504) rather than hanging.
 */
export const UPSTREAM_TIMEOUT_MS = 30_000;

/** Max questions accepted in one batched request (abuse + cost bound). */
export const MAX_QUESTIONS = 40;

/**
 * Sonnet 4.6 pricing, USD per 1M tokens, for $/audit logging. Cache reads bill
 * at ~0.1x input; cache writes at ~1.25x input. Kept here so the cost log
 * stays accurate if we change the model.
 */
export const PRICING_PER_MTOK = {
  input: 3.0,
  output: 15.0,
  cacheRead: 0.3,
  cacheWrite: 3.75,
} as const;

/**
 * The shipped Chrome extension's id. NOT yet in the allowlist — the extension
 * is out of scope for this unit. When Unit N wires the extension as a caller,
 * add `EXTENSION_ORIGIN` to `getAllowedOrigins()` below (see the documented
 * slot there).
 */
export const EXTENSION_ID = 'cnnnbdgkiblailjaacdpkbhmeeaijpao';
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * The set of Origins allowed to call the judge proxy. Resolved at request time
 * (not module load) so env changes and per-deploy URLs are picked up.
 *
 * Sources, in order:
 *   - `JUDGE_ALLOWED_ORIGINS` — explicit comma-separated allowlist (prod).
 *   - `NEXT_PUBLIC_SITE_URL` — the canonical site origin.
 *   - `VERCEL_URL` — the current deployment's origin.
 *   - `http://localhost:3000` — local dev only (never in production).
 *
 * The extension origin is intentionally absent — see `EXTENSION_ORIGIN`.
 */
export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();

  const explicit = process.env.JUDGE_ALLOWED_ORIGINS;
  if (explicit) {
    for (const o of explicit.split(',')) {
      const trimmed = normalizeOrigin(o);
      if (trimmed) origins.add(trimmed);
    }
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    origins.add(normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL));
  }
  if (process.env.VERCEL_URL) {
    origins.add(`https://${normalizeOrigin(process.env.VERCEL_URL)}`);
  }
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
  }

  // ── Documented slot for the extension (out of scope for this unit) ──
  // When the extension becomes a caller, uncomment the next line:
  // origins.add(EXTENSION_ORIGIN);

  return [...origins];
}

/** Is `origin` allowed to call the proxy? `null`/empty Origin is rejected. */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return getAllowedOrigins().includes(normalizeOrigin(origin));
}
