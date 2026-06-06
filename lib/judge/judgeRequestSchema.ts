import type { JudgeRequest } from '@/lib/engine/types/judge';

/**
 * Shared parser + input-size caps for the judge request body.
 *
 * Extracted from `app/api/judge/route.ts` so EVERY public caller that
 * relays to the proxy validates and caps identically — the proxy itself
 * (`/api/judge`) and the secretless extension relay (`/api/extension-judge`).
 * Both must reject the same oversized payloads BEFORE any Anthropic call,
 * so a malformed/abusive payload can't inflate token cost on either entry
 * point. Single source of truth = no drift between the two gates.
 */

/**
 * Per-field input-text caps applied before building the prompt.
 *
 * LinkedIn's actual limits are 220 chars for the headline and 2600 for
 * About. The caps below sit well above those — generous enough for any
 * plausible legitimate input but tight enough that a malformed payload
 * (or a spoofed-origin caller hitting the secretless relay) can't hand
 * megabytes of text to Anthropic and burn the per-IP daily budget on a
 * single call. The rate limit counts calls, not tokens, so this is the
 * input-side guard.
 */
export const MAX_HEADLINE_CHARS = 500;
export const MAX_ABOUT_CHARS = 5000;

export interface ParsedJudgeRequest {
  request: JudgeRequest;
  auditId: string | null;
}

export type ParseJudgeRequestResult =
  | { ok: true; value: ParsedJudgeRequest }
  | { ok: false; reason: string };

/**
 * Validate + normalise an inbound `{ judgeRequest, auditId }` body.
 *
 * Mirrors exactly what the proxy supports today: Headline + About (the
 * only text fields the prompt consumes), plus `rolesFamilyHint` and the
 * `rewriteTargets` allow-list. Extra fields the extension may send (the
 * broader 12-section set) are intentionally ignored here — reconciling
 * the extension's section coverage with the proxy is a separate decision
 * (see the extension-judge brief's OUT OF SCOPE note).
 */
export function parseJudgeRequestBody(payload: unknown): ParseJudgeRequestResult {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'Body must include `judgeRequest` with at least one section.' };
  }
  const body = payload as { judgeRequest?: unknown; auditId?: unknown };
  if (typeof body.judgeRequest !== 'object' || body.judgeRequest === null) {
    return { ok: false, reason: 'Body must include `judgeRequest` with at least one section.' };
  }
  const req = body.judgeRequest as Record<string, unknown>;

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
