import { NextResponse } from 'next/server';

import { extractIp, hashIp } from '@/lib/audit/hashIp';
import {
  callAnthropic,
  estimateUsd,
  DEFAULT_PRICES,
  type PriceTable,
} from '@/lib/judge/anthropicClient';
import { buildJudgePrompt } from '@/lib/judge/buildPrompt';
import { parseJudgeResponse } from '@/lib/judge/parseResponse';
import { consumeJudgeRateLimit } from '@/lib/judge/rateLimit';
import type { JudgeRequest, JudgeResponse } from '@/lib/engine/types/judge';

export const runtime = 'nodejs';

// Default to the latest publicly-released Sonnet 4.x model id. The
// initial draft used `claude-sonnet-4-7`, which is an internal Claude
// Code naming convention — NOT a public Anthropic API id. Live
// requests against that id 404 with model-not-found, which the catch
// degrades to `judge_unavailable`, so the proxy looked configured but
// could never actually call. Operators can pin a specific dated id
// (e.g. `claude-sonnet-4-5-20250929`) via JUDGE_MODEL.
const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_MAX_OUTPUT_TOKENS = 1500;
const DEFAULT_RATE_LIMIT_PER_DAY = 50;

/**
 * Per-field input-text caps applied before building the prompt.
 *
 * LinkedIn's actual limits are 220 chars for the headline and 2600
 * for About. The caps below sit well above those — generous enough
 * for any plausible legitimate input but tight enough that a
 * malformed extension payload (or a future allow-listed origin sent
 * by a malicious caller) can't hand megabytes of text to Anthropic
 * and burn the per-IP daily budget on a single call. Rate limit
 * applies AFTER the upstream call, so this is the input-side guard.
 */
const MAX_HEADLINE_CHARS = 500;
const MAX_ABOUT_CHARS = 5000;

/**
 * AI-judge proxy.
 *
 * Holds the Anthropic key server-side and serves both the web audit
 * (server-to-server call from `/api/audit` flow) and the future Chrome
 * extension (browser-side call). The web app + extension only know
 * `PROXY_URL` — never the Anthropic key.
 *
 * Auth model:
 *   - Same-server callers (the web audit pipeline running inside this
 *     Next.js process) send `X-Judge-Auth: <secret>` matching
 *     `JUDGE_PROXY_SECRET`. There's no browser Origin in this path.
 *   - Browser callers (future Chrome extension) must have an Origin
 *     header matching `JUDGE_ALLOWED_ORIGINS` (comma-separated env).
 *   - A request that satisfies EITHER check is allowed; one without
 *     either is 403.
 *
 * Cost controls:
 *   - One batched call per audit (the caller sends a single request
 *     covering Headline + About + the rewrites).
 *   - Hard `max_tokens` cap (DEFAULT_MAX_OUTPUT_TOKENS, configurable
 *     via `JUDGE_MAX_OUTPUT_TOKENS`).
 *   - 12s request timeout (Anthropic client default).
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
  const extracted = extractJudgeRequest(payload);
  if (!extracted.ok) {
    return withCors(
      NextResponse.json({ error: extracted.reason }, { status: 400 }),
      request,
    );
  }
  const judgeRequest = extracted.value;

  // 3. Rate limit
  const rateLimitKey =
    auth.kind === 'origin'
      ? `origin:${auth.origin}:${hashIp(extractIp(request.headers)) ?? 'unhashed'}`
      : `server:${hashIp(extractIp(request.headers)) ?? 'unhashed'}`;
  const limit = numericEnv('JUDGE_RATE_LIMIT_PER_DAY', DEFAULT_RATE_LIMIT_PER_DAY);
  const decision = await consumeJudgeRateLimit(rateLimitKey, limit);
  if (!decision.allowed) {
    console.warn(
      `[api/judge] rate-limited key=${rateLimitKey} count=${decision.count} limit=${decision.limit} backend=${decision.backend}`,
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
  const allowed = (process.env.JUDGE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isAllowed = origin !== null && allowed.includes(origin);
  const headers: Record<string, string> = {
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (isAllowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Judge-Auth';
  }
  return new Response(null, { status: 204, headers });
}

// ---------- helpers ----------

/**
 * Attach CORS response headers when the request's `Origin` is on the
 * allowlist. The browser otherwise blocks the response from reaching
 * the JS caller. Server-to-server callers (no `Origin`) get no extra
 * headers — they don't need them and adding `Access-Control-Allow-
 * Origin: *` would weaken the contract.
 */
function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get('origin');
  if (!origin) return response;
  const allowed = (process.env.JUDGE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return response;
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
  return response;
}

type AuthDecision =
  | { ok: true; kind: 'secret' }
  | { ok: true; kind: 'origin'; origin: string }
  | { ok: false; reason: string };

function authoriseCaller(request: Request): AuthDecision {
  const secret = process.env.JUDGE_PROXY_SECRET;
  if (secret) {
    const provided = request.headers.get('x-judge-auth');
    if (provided && provided === secret) {
      return { ok: true, kind: 'secret' };
    }
  }
  const origin = request.headers.get('origin');
  const allowed = (process.env.JUDGE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return { ok: true, kind: 'origin', origin };
  }
  return {
    ok: false,
    reason:
      'Origin not allowed. Server-to-server callers must send a valid X-Judge-Auth header; ' +
      'browser callers must come from JUDGE_ALLOWED_ORIGINS.',
  };
}

interface ParsedJudgeRequest {
  request: JudgeRequest;
  auditId: string | null;
}

type ExtractResult =
  | { ok: true; value: ParsedJudgeRequest }
  | { ok: false; reason: string };

function extractJudgeRequest(payload: unknown): ExtractResult {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'Body must include `judgeRequest` with at least one section.' };
  }
  const body = payload as { judgeRequest?: unknown; auditId?: unknown };
  if (typeof body.judgeRequest !== 'object' || body.judgeRequest === null) {
    return { ok: false, reason: 'Body must include `judgeRequest` with at least one section.' };
  }
  const req = body.judgeRequest as Record<string, unknown>;
  // Codex P2 — input-text caps. A browser-origin caller could otherwise
  // hand megabytes of text to Anthropic in a single audit, blowing the
  // per-IP daily budget before the rate limit kicks in (the limit
  // counts calls, not tokens). Cap at well above LinkedIn's actual
  // limits (220 chars / 2600 chars) and reject anything that pretends
  // those slots are bigger.
  const headlineRaw = isTextField(req.headline) ? req.headline.text : undefined;
  if (headlineRaw !== undefined && headlineRaw.length > MAX_HEADLINE_CHARS) {
    return {
      ok: false,
      reason: `judgeRequest.headline.text exceeds the ${MAX_HEADLINE_CHARS}-char cap.`,
    };
  }
  const aboutRaw = isTextField(req.about) ? req.about.text : undefined;
  if (aboutRaw !== undefined && aboutRaw.length > MAX_ABOUT_CHARS) {
    return {
      ok: false,
      reason: `judgeRequest.about.text exceeds the ${MAX_ABOUT_CHARS}-char cap.`,
    };
  }
  const headline = headlineRaw !== undefined ? { text: headlineRaw } : undefined;
  const about = aboutRaw !== undefined ? { text: aboutRaw } : undefined;
  if (!headline && !about) {
    return { ok: false, reason: 'Body must include `judgeRequest` with at least one section.' };
  }
  const rolesFamilyHint = typeof req.rolesFamilyHint === 'string' ? req.rolesFamilyHint : null;
  const targetsRaw = Array.isArray(req.rewriteTargets) ? req.rewriteTargets : [];
  const rewriteTargets = targetsRaw.filter(
    (t): t is 'headline' | 'about' | 'currentExperience' =>
      t === 'headline' || t === 'about' || t === 'currentExperience',
  );
  const judgeRequest: JudgeRequest = {
    headline,
    about,
    rolesFamilyHint,
    rewriteTargets,
  };
  const auditId = typeof body.auditId === 'string' ? body.auditId : null;
  return { ok: true, value: { request: judgeRequest, auditId } };
}

function isTextField(v: unknown): v is { text: string } {
  return typeof v === 'object' && v !== null && typeof (v as { text?: unknown }).text === 'string';
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
