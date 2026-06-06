import { NextResponse } from 'next/server';

import {
  buildPreflightResponse,
  isOriginAllowed,
  parseAllowedOrigins,
  withCorsHeaders,
} from '@/lib/judge/cors';
import { createServerJudge } from '@/lib/judge/createServerJudge';
import type { HttpJudgeOutcome } from '@/lib/judge/httpJudge';
import { deriveJudgeRateKey } from '@/lib/judge/ipRateKey';
import { parseJudgeRequestBody } from '@/lib/judge/judgeRequestSchema';
import { consumeJudgeRateLimit } from '@/lib/judge/rateLimit';

export const runtime = 'nodejs';
// Same cap as the proxy: must sit above the upstream Anthropic timeout
// so the upstream aborts first and we relay a structured
// `judge_unavailable` rather than a Vercel 504.
export const maxDuration = 60;

/**
 * The published Chrome extension's origin. A shipped extension's id is
 * fixed, so this is a safe default; `EXTENSION_JUDGE_ALLOWED_ORIGINS`
 * overrides it (comma-separated) for unpacked/dev builds with a
 * different id.
 */
const DEFAULT_EXTENSION_ORIGIN = 'chrome-extension://cnnnbdgkiblailjaacdpkbhmeeaijpao';

/** Separate daily bucket from the proxy so extension spend is independently
 * capped and observable. */
const RATE_KEY_PREFIX = 'ext-judge';
const DEFAULT_RATE_LIMIT_PER_DAY = 50;

/** Browser preflight only needs Content-Type — this relay is SECRETLESS
 * (no X-Judge-Auth from the extension; the secret is added server-side). */
const ALLOW_HEADERS = 'Content-Type';

/**
 * Secretless extension → AI-judge relay.
 *
 * The Chrome extension is fully inspectable once shipped, so it cannot
 * bundle `JUDGE_PROXY_SECRET`. Instead it POSTs the profile's
 * judge-relevant fields here; this endpoint adds the secret server-side
 * and relays to the existing `/api/judge` proxy via the shared
 * `HttpJudge` path (no proxy logic is duplicated). The secret never
 * leaves the server.
 *
 * Because there's no secret, the gates here are the ONLY thing standing
 * between the public and the Anthropic budget:
 *   - CORS allow-list restricted to the extension origin (browser-
 *     enforced; spoofable by scripts — documented MVP tradeoff).
 *   - Per-IP daily rate limit (the real damage bound).
 *   - Per-field input caps (token-cost bound), applied before relaying.
 *
 * Failure of ANY kind (not configured, rate-limited, proxy down, parse
 * error) returns `{ status: 'judge_unavailable' }` with HTTP 200 so the
 * extension keeps its structural-only fallback — the same contract the
 * proxy and web audit already honour.
 */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const allowed = resolveAllowedOrigins();

  // 1. Origin gate. This is the only origin check (no secret), so a
  //    request that doesn't present an allowed extension origin is
  //    rejected outright. CORS headers are attached only for allowed
  //    origins, so a disallowed browser caller sees a CORS failure and
  //    a non-browser caller sees the 403 body.
  if (!isOriginAllowed(origin, allowed)) {
    return withCorsHeaders(
      NextResponse.json({ error: 'Origin not allowed.' }, { status: 403 }),
      origin,
      allowed,
    );
  }

  // 2. Per-IP daily rate limit — the real abuse bound for this
  //    unauthenticated endpoint. Applied BEFORE body parsing so that
  //    malformed / oversized payloads also consume budget: otherwise a
  //    spoofed-origin script could force unbounded JSON-parse +
  //    validation work without ever spending its documented quota
  //    (Codex P2). Reuses the proxy's key derivation + limiter;
  //    `memoryOnly` keeps a raw IP out of persistent KV when
  //    `IP_HASH_PEPPER` is unset.
  const { rateLimitKey, memoryOnly, keyShape } = deriveJudgeRateKey(
    request.headers,
    RATE_KEY_PREFIX,
  );
  const limit = numericEnv('EXTENSION_JUDGE_RATE_LIMIT_PER_DAY', DEFAULT_RATE_LIMIT_PER_DAY);
  const decision = await consumeJudgeRateLimit(rateLimitKey, limit, undefined, { memoryOnly });
  if (!decision.allowed) {
    console.warn(
      `[api/extension-judge] rate-limited origin=extension keyShape=${keyShape} ` +
        `count=${decision.count} limit=${decision.limit} backend=${decision.backend}`,
    );
    // auditId isn't parsed yet (rate limit precedes parsing); null is
    // fine — the extension treats every judge_unavailable identically.
    return withCorsHeaders(judgeUnavailable('rate_limited', null), origin, allowed);
  }

  // 3. Parse + validate + cap input (before any upstream work).
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withCorsHeaders(
      NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }),
      origin,
      allowed,
    );
  }
  const parsed = parseJudgeRequestBody(payload);
  if (!parsed.ok) {
    return withCorsHeaders(
      NextResponse.json({ error: parsed.reason }, { status: 400 }),
      origin,
      allowed,
    );
  }
  const { request: judgeRequest, auditId } = parsed.value;

  // 4. Relay to the proxy via the shared HttpJudge path. `createServerJudge`
  //    adds `X-Judge-Auth` from env and forwards the end-user IP so the
  //    proxy's own rate limit partitions by real caller. When the secret
  //    is unset it returns a NullJudge — surface that as not_configured.
  if (!process.env.JUDGE_PROXY_SECRET) {
    console.warn('[api/extension-judge] JUDGE_PROXY_SECRET unset — degrading to judge_unavailable.');
    return withCorsHeaders(judgeUnavailable('not_configured', auditId), origin, allowed);
  }

  let outcome: HttpJudgeOutcome | undefined;
  const judge = createServerJudge({
    origin: new URL(request.url).origin,
    auditId: auditId ?? 'extension',
    // This relay already enforced its own per-IP limit (the ext-judge
    // bucket above), so tell the proxy to skip its limit — otherwise
    // extension calls would also burn the same IP's web `judge:` quota
    // and the extension cap wouldn't be independent. The skip is honoured
    // only because createServerJudge also sends the secret.
    skipProxyRateLimit: true,
    onResult: (o) => {
      outcome = o;
    },
  });
  const judgeResponse = await judge.evaluate(judgeRequest);

  if (outcome?.status === 'ok') {
    const usage = outcome.usage;
    // Cost-per-audit, tagged origin=extension so extension spend is
    // separable from web spend in the logs.
    console.log(
      `[api/extension-judge] ok origin=extension auditId=${auditId ?? 'none'} ` +
        `inputTokens=${usage?.inputTokens ?? 0} outputTokens=${usage?.outputTokens ?? 0} ` +
        `usd=${usage?.estimatedUsd ?? 0} elapsedMs=${outcome.elapsedMs} ` +
        `rateBackend=${decision.backend} rateCount=${decision.count}/${decision.limit}`,
    );
    return withCorsHeaders(
      NextResponse.json({ status: 'ok', judgeResponse, usage, auditId }),
      origin,
      allowed,
    );
  }

  const reason = outcome?.reason ?? 'unknown';
  console.warn(
    `[api/extension-judge] unavailable origin=extension auditId=${auditId ?? 'none'} reason=${reason}`,
  );
  return withCorsHeaders(judgeUnavailable(reason, auditId), origin, allowed);
}

/**
 * CORS preflight. Only the extension origin gets the permissive headers;
 * an unknown origin gets a 204 with no allow-origin, which the browser
 * treats as a CORS failure.
 */
export async function OPTIONS(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  return buildPreflightResponse(origin, resolveAllowedOrigins(), ALLOW_HEADERS);
}

// ---------- helpers ----------

function resolveAllowedOrigins(): string[] {
  const parsed = parseAllowedOrigins(process.env.EXTENSION_JUDGE_ALLOWED_ORIGINS);
  return parsed.length > 0 ? parsed : [DEFAULT_EXTENSION_ORIGIN];
}

function judgeUnavailable(reason: string, auditId: string | null): Response {
  return NextResponse.json(
    { status: 'judge_unavailable', reason, auditId },
    { status: 200 },
  );
}

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
