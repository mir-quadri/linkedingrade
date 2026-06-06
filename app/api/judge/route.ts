import { NextResponse } from 'next/server';

import {
  callAnthropic,
  estimateUsd,
  DEFAULT_PRICES,
  type PriceTable,
} from '@/lib/judge/anthropicClient';
import { buildJudgePrompt } from '@/lib/judge/buildPrompt';
import {
  buildPreflightResponse,
  parseAllowedOrigins,
  withCorsHeaders,
} from '@/lib/judge/cors';
import { deriveJudgeRateKey } from '@/lib/judge/ipRateKey';
import { parseJudgeRequestBody } from '@/lib/judge/judgeRequestSchema';
import { parseJudgeResponse } from '@/lib/judge/parseResponse';
import { consumeJudgeRateLimit } from '@/lib/judge/rateLimit';
import type { JudgeResponse } from '@/lib/engine/types/judge';

export const runtime = 'nodejs';
// Vercel function timeout. Must sit ABOVE the upstream Anthropic
// timeout (30s in `lib/judge/anthropicClient.ts`) so the upstream
// AbortController fires first and we return a structured
// `judge_unavailable` instead of Vercel killing the function with a
// 504. Pro plan default is 60s, but we set it explicitly so the cap
// is part of the contract, not the plan.
export const maxDuration = 60;

// Default to the latest publicly-released Sonnet 4.x model id. The
// initial draft used `claude-sonnet-4-7`, which is an internal Claude
// Code naming convention — NOT a public Anthropic API id. Live
// requests against that id 404 with model-not-found, which the catch
// degrades to `judge_unavailable`, so the proxy looked configured but
// could never actually call. Operators can pin a specific dated id
// via JUDGE_MODEL. Bump this alias as Anthropic ships new minor
// versions of the Sonnet 4.x line.
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_OUTPUT_TOKENS = 1500;
const DEFAULT_RATE_LIMIT_PER_DAY = 50;

/**
 * AI-judge proxy.
 *
 * Holds the Anthropic key server-side and serves both the web audit
 * (server-to-server call from `/api/audit` flow) and the future Chrome
 * extension (browser-side call). The web app + extension only know
 * `PROXY_URL` — never the Anthropic key.
 *
 * Auth model:
 *   - EVERY caller (server-to-server AND any future browser caller)
 *     must present `X-Judge-Auth: <secret>` matching `JUDGE_PROXY_SECRET`.
 *     Origin headers are trivially spoofable by non-browser clients
 *     (curl, scripts), so an Origin allowlist alone cannot be a real
 *     auth gate — without the secret, this endpoint would degrade to
 *     a free unauthenticated Anthropic proxy up to the per-IP rate
 *     limit. (Codex Round 3 P1.)
 *   - `JUDGE_ALLOWED_ORIGINS` is CORS-only: it controls which browser
 *     origins are allowed to READ the response (via the CORS preflight
 *     + response headers), but it grants no privilege on its own.
 *   - The future Chrome extension will need its own unspoofable browser
 *     auth (server-mediated token exchange, signed installation
 *     receipt, or similar) — deferred to the extension-wiring PR.
 *
 * Cost controls:
 *   - One batched call per audit (the caller sends a single request
 *     covering Headline + About + the rewrites).
 *   - Hard `max_tokens` cap (DEFAULT_MAX_OUTPUT_TOKENS, configurable
 *     via `JUDGE_MAX_OUTPUT_TOKENS`).
 *   - 30s upstream Anthropic timeout (client default). HttpJudge
 *     callers sit at 35s so the upstream times out first and the
 *     caller sees a structured `judge_unavailable`.
 *   - Per-IP-hash daily rate limit, KV-backed (DEFAULT_RATE_LIMIT_PER_DAY
 *     configurable via `JUDGE_RATE_LIMIT_PER_DAY`).
 *   - Cost-per-audit logged on every success.
 *
 * Failure mode:
 *   - ANY downstream failure (Anthropic outage, parse error, rate
 *     limit, timeout) returns `{ status: 'judge_unavailable', reason }`
 *     with HTTP 200. The engine's NullJudge fallback already handles
 *     the empty-judgments path; this contract keeps the audit
 *     working when the proxy is degraded instead of 500ing the whole
 *     pipeline.
 *   - 4xx is reserved for caller errors (bad auth, malformed body).
 */
export async function POST(request: Request) {
  // 1. Auth
  const auth = authoriseCaller(request);
  if (!auth.ok) {
    // Even on a 403 we attach the CORS-allow-origin header IF the
    // caller's origin happens to be on the allowlist (it isn't, since
    // auth failed) — otherwise the browser would not surface our 403
    // body to the JS caller and the extension would see a generic
    // "CORS error" instead of the clear "Origin not allowed" reason.
    // For the no-origin / wrong-origin case, returning no CORS header
    // is the right behaviour: same-origin servers don't need it.
    return withCors(
      NextResponse.json({ error: auth.reason }, { status: 403 }),
      request,
    );
  }

  // 2. Parse request
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withCors(
      NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }),
      request,
    );
  }
  const extracted = parseJudgeRequestBody(payload);
  if (!extracted.ok) {
    return withCors(
      NextResponse.json({ error: extracted.reason }, { status: 400 }),
      request,
    );
  }
  const judgeRequest = extracted.value;

  // 3. Rate limit.
  //
  // Codex Round 3 P2: when IP_HASH_PEPPER is absent, hashIp() returns
  // null. Falling back to a literal `unhashed` token collapses every
  // caller into one global bucket; one misconfigured deployment, or
  // any server-to-server caller without a forwarded IP, exhausts the
  // documented per-IP daily limit for everyone. So we partition by
  // the raw IP in that fallback case.
  //
  // Codex Round 4 P2: raw IPs must not be persisted, even briefly.
  // `lib/audit/hashIp.ts` codifies this — it returns `null` rather
  // than persist an un-peppered hash, because IPv4's keyspace makes
  // such hashes weakly reversible. The audit pipeline applies the
  // same rule to KV. So when the fallback engages, we route the
  // counter through the in-memory map only (volatile process memory,
  // not Redis). Per-instance scope is an acceptable degraded mode for
  // a deployment that hasn't set the pepper — the right fix is for
  // the operator to set IP_HASH_PEPPER.
  //
  // Codex Round 5 P2: never log the rate-limit key directly — when
  // pepper is unset it embeds the raw IP, and Vercel/runtime logs are
  // persistent (same contract `lib/audit/hashIp.ts` enforces for KV).
  // `deriveJudgeRateKey` returns the key SHAPE only for logging; that's
  // enough to diagnose abuse (which partition is over-limit) without
  // persisting the identifier.
  const { rateLimitKey, memoryOnly, keyShape } = deriveJudgeRateKey(request.headers, 'judge');
  const limit = numericEnv('JUDGE_RATE_LIMIT_PER_DAY', DEFAULT_RATE_LIMIT_PER_DAY);
  const decision = await consumeJudgeRateLimit(rateLimitKey, limit, undefined, {
    memoryOnly,
  });
  if (!decision.allowed) {
    console.warn(
      `[api/judge] rate-limited keyShape=${keyShape} count=${decision.count} limit=${decision.limit} backend=${decision.backend}`,
    );
    return withCors(
      judgeUnavailable('rate_limited', { auditId: judgeRequest.auditId }),
      request,
    );
  }

  // 4. Build prompt + call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[api/judge] ANTHROPIC_API_KEY not set — degrading to judge_unavailable.');
    return withCors(
      judgeUnavailable('not_configured', { auditId: judgeRequest.auditId }),
      request,
    );
  }
  const model = process.env.JUDGE_MODEL?.trim() || DEFAULT_MODEL;
  const maxOutputTokens = numericEnv(
    'JUDGE_MAX_OUTPUT_TOKENS',
    DEFAULT_MAX_OUTPUT_TOKENS,
  );

  const prompt = buildJudgePrompt(judgeRequest.request);
  let judgeResponse: JudgeResponse;
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const startedAt = Date.now();
  try {
    const result = await callAnthropic({
      apiKey,
      model,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      maxOutputTokens,
    });
    inputTokens = result.usage.inputTokens;
    outputTokens = result.usage.outputTokens;
    costUsd = estimateUsd(result.usage, readPrices());
    judgeResponse = parseJudgeResponse(result.text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/judge] judge call failed auditId=${judgeRequest.auditId ?? 'none'} model=${model}: ${reason}`,
    );
    return withCors(
      judgeUnavailable(reason, { auditId: judgeRequest.auditId }),
      request,
    );
  }

  // 5. Log cost-per-audit so we can correlate spend with audit volume.
  console.log(
    `[api/judge] ok auditId=${judgeRequest.auditId ?? 'none'} model=${model} ` +
      `inputTokens=${inputTokens} outputTokens=${outputTokens} usd=${costUsd} ` +
      `elapsedMs=${Date.now() - startedAt} rateBackend=${decision.backend} rateCount=${decision.count}/${decision.limit}`,
  );

  return withCors(
    NextResponse.json({
      status: 'ok',
      judgeResponse,
      usage: { inputTokens, outputTokens, estimatedUsd: costUsd },
      auditId: judgeRequest.auditId,
    }),
    request,
  );
}

/**
 * CORS preflight handler. Browser callers (the future Chrome extension)
 * issue an OPTIONS request before the POST when the content-type is
 * `application/json`; without this handler the browser blocks the
 * actual request and the extension would see a generic "CORS error"
 * even though server-side auth would have approved the call.
 *
 * Only origins on `JUDGE_ALLOWED_ORIGINS` get a permissive response —
 * an unknown origin gets a 204 with NO `Access-Control-Allow-Origin`
 * header, which the browser treats as a CORS failure and surfaces to
 * the JS caller. (We can't differentiate "this is a probe" from "this
 * is a malicious origin" at the OPTIONS stage; the response is
 * uniform.)
 */
export async function OPTIONS(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const allowed = parseAllowedOrigins(process.env.JUDGE_ALLOWED_ORIGINS);
  return buildPreflightResponse(origin, allowed, 'Content-Type, X-Judge-Auth');
}

// ---------- helpers ----------

/**
 * Attach CORS response headers when the request's `Origin` is on the
 * `JUDGE_ALLOWED_ORIGINS` allowlist. Server-to-server callers (no
 * `Origin`) get no extra headers — see `lib/judge/cors.ts`.
 */
function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get('origin');
  const allowed = parseAllowedOrigins(process.env.JUDGE_ALLOWED_ORIGINS);
  return withCorsHeaders(response, origin, allowed);
}

type AuthDecision =
  | { ok: true; kind: 'secret' }
  | { ok: false; reason: string };

function authoriseCaller(request: Request): AuthDecision {
  // Codex Round 3 P1: secret is required on every call. Origin alone
  // is not an auth gate (it's spoofable by non-browser callers).
  const secret = process.env.JUDGE_PROXY_SECRET;
  if (!secret) {
    return { ok: false, reason: 'Judge proxy is not configured (JUDGE_PROXY_SECRET unset).' };
  }
  const provided = request.headers.get('x-judge-auth');
  if (!provided || provided !== secret) {
    return { ok: false, reason: 'Missing or invalid X-Judge-Auth header.' };
  }
  return { ok: true, kind: 'secret' };
}

function judgeUnavailable(reason: string, ctx: { auditId: string | null }) {
  return NextResponse.json(
    {
      status: 'judge_unavailable',
      reason,
      auditId: ctx.auditId,
    },
    { status: 200 },
  );
}

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readPrices(): PriceTable {
  const input = Number(process.env.JUDGE_PRICE_INPUT_USD_PER_MILLION);
  const output = Number(process.env.JUDGE_PRICE_OUTPUT_USD_PER_MILLION);
  return {
    inputUsdPerMillion: Number.isFinite(input) && input > 0 ? input : DEFAULT_PRICES.inputUsdPerMillion,
    outputUsdPerMillion: Number.isFinite(output) && output > 0 ? output : DEFAULT_PRICES.outputUsdPerMillion,
  };
}
