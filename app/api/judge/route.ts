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

const DEFAULT_MODEL = 'claude-sonnet-4-7';
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
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  // 2. Parse request
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const judgeRequest = extractJudgeRequest(payload);
  if (!judgeRequest) {
    return NextResponse.json(
      { error: 'Body must include `judgeRequest` with at least one section.' },
      { status: 400 },
    );
  }

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
    return judgeUnavailable('rate_limited', {
      auditId: judgeRequest.auditId,
    });
  }

  // 4. Build prompt + call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[api/judge] ANTHROPIC_API_KEY not set — degrading to judge_unavailable.');
    return judgeUnavailable('not_configured', { auditId: judgeRequest.auditId });
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
    return judgeUnavailable(reason, { auditId: judgeRequest.auditId });
  }

  // 5. Log cost-per-audit so we can correlate spend with audit volume.
  console.log(
    `[api/judge] ok auditId=${judgeRequest.auditId ?? 'none'} model=${model} ` +
      `inputTokens=${inputTokens} outputTokens=${outputTokens} usd=${costUsd} ` +
      `elapsedMs=${Date.now() - startedAt} rateBackend=${decision.backend} rateCount=${decision.count}/${decision.limit}`,
  );

  return NextResponse.json({
    status: 'ok',
    judgeResponse,
    usage: { inputTokens, outputTokens, estimatedUsd: costUsd },
    auditId: judgeRequest.auditId,
  });
}

// ---------- helpers ----------

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

function extractJudgeRequest(payload: unknown): ParsedJudgeRequest | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as { judgeRequest?: unknown; auditId?: unknown };
  if (typeof body.judgeRequest !== 'object' || body.judgeRequest === null) return null;
  const req = body.judgeRequest as Record<string, unknown>;
  const headline = isTextField(req.headline) ? { text: req.headline.text } : undefined;
  const about = isTextField(req.about) ? { text: req.about.text } : undefined;
  if (!headline && !about) return null;
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
  return { request: judgeRequest, auditId };
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
