import { NextResponse } from 'next/server';

import { extractIp, hashIp } from '@/lib/audit/hashIp';
import { callJudge } from '@/lib/judge/callJudge';
import {
  MAX_AUDIT_ID_CHARS,
  MAX_CONTEXT_CHARS,
  MAX_QUESTION_CHARS,
  MAX_QUESTION_ID_CHARS,
  MAX_QUESTIONS,
  MAX_SECTION_ID_CHARS,
  MAX_TOTAL_REQUEST_CHARS,
  isOriginAllowed,
} from '@/lib/judge/config';
import { getRateLimiter } from '@/lib/judge/rateLimit';
import type { JudgeFailureReason, JudgeQuestion, JudgeRequest, JudgeResponse } from '@/lib/judge/types';

export const runtime = 'nodejs';

/** Map a structured failure reason to its HTTP status. */
function statusForReason(reason: JudgeFailureReason): number {
  switch (reason) {
    case 'invalid_request':
      return 400;
    case 'forbidden_origin':
      return 403;
    case 'rate_limited':
      return 429;
    case 'unconfigured':
      return 503;
    case 'upstream_timeout':
      return 504;
    case 'upstream_error':
    case 'parse_error':
      return 502;
  }
}

function fail(reason: JudgeFailureReason, message?: string): NextResponse {
  const body: JudgeResponse = { ok: false, reason, message };
  return NextResponse.json(body, { status: statusForReason(reason) });
}

/** Validate + sanitise the POST body into a `JudgeRequest`, or null if invalid. */
function parseJudgeRequest(payload: unknown): JudgeRequest | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { questions, auditId } = payload as { questions?: unknown; auditId?: unknown };
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > MAX_QUESTIONS) {
    return null;
  }
  if (typeof auditId === 'string' && auditId.length > MAX_AUDIT_ID_CHARS) return null;

  const clean: JudgeQuestion[] = [];
  const seenIds = new Set<string>();
  let totalChars = 0;
  for (const q of questions) {
    if (typeof q !== 'object' || q === null) return null;
    const { id, sectionId, question, context } = q as Record<string, unknown>;
    if (typeof id !== 'string' || !id || id.length > MAX_QUESTION_ID_CHARS) return null;
    if (typeof sectionId !== 'string' || !sectionId || sectionId.length > MAX_SECTION_ID_CHARS) {
      return null;
    }
    if (typeof question !== 'string' || !question || question.length > MAX_QUESTION_CHARS) return null;
    // context may be empty, but must be a string and within the cap.
    if (typeof context !== 'string' || context.length > MAX_CONTEXT_CHARS) return null;
    // Question ids must be unique — the answer-coverage check downstream relies
    // on a 1:1 id mapping, and duplicates would make coverage ambiguous.
    if (seenIds.has(id)) return null;
    seenIds.add(id);
    // Bound the total payload size forwarded to the paid upstream.
    totalChars += id.length + sectionId.length + question.length + context.length;
    if (totalChars > MAX_TOTAL_REQUEST_CHARS) return null;
    clean.push({ id, sectionId, question, context });
  }

  return {
    auditId: typeof auditId === 'string' ? auditId : undefined,
    questions: clean,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Origin allowlist. A shipped extension / client is fully inspectable, so
  //    the proxy only answers callers it recognises. (Extension origin is a
  //    documented, not-yet-enabled slot — see lib/judge/config.ts.)
  if (!isOriginAllowed(request.headers.get('origin'))) {
    return fail('forbidden_origin', 'Origin not allowed.');
  }

  // 2. Per-IP/day rate limit — the primary spend guardrail.
  const ip = extractIp(request.headers);
  // Rate-limit key: peppered hash when available, else the raw IP. These keys
  // are ephemeral (daily-expiring), not long-term storage.
  const rlKey = hashIp(ip) ?? ip ?? 'unknown';
  try {
    const limiter = await getRateLimiter();
    const result = await limiter.hit(rlKey);
    if (!result.allowed) {
      return fail('rate_limited', `Daily limit of ${result.limit} requests reached.`);
    }
  } catch (err) {
    // A limiter failure must not 500 the endpoint — fail open on the counter
    // (the upstream call still has its own cost cap via max_tokens).
    console.warn('[judge] rate limiter error; failing open', (err as Error).message);
  }

  // 3. Parse + validate the body.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail('invalid_request', 'Body was not valid JSON.');
  }
  const judgeRequest = parseJudgeRequest(payload);
  if (!judgeRequest) {
    return fail('invalid_request', 'Expected { questions: JudgeQuestion[] } with 1+ items.');
  }

  // 4. Server-side key. Never reaches the client; absence is a config error,
  //    surfaced as a structured failure the engine can absorb.
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail('unconfigured', 'Judge is not configured.');
  }

  // 5. One batched Claude call. callJudge never throws — any upstream/parse/
  //    timeout problem comes back as { ok: false, reason }.
  const response = await callJudge(judgeRequest);
  const status = response.ok ? 200 : statusForReason(response.reason);
  return NextResponse.json(response, { status });
}
