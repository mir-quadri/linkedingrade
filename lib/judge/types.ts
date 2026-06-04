/**
 * Judge proxy contract (B3 / Unit 1).
 *
 * The shared request/response types for the server-side AI-judge proxy. The
 * scoring engine (Unit 2) implements *against* this contract — it builds a
 * `JudgeRequest`, POSTs it to the proxy, and reads a `JudgeResponse`. The
 * engine never holds the Anthropic key or talks to Claude directly; the proxy
 * is the only thing that does.
 *
 * The whole point of the `{ ok: false, reason }` shape is graceful failure:
 * the proxy promises to ALWAYS return a structured response (never an
 * unhandled 500), so the judge can read `ok: false` and fall back to
 * `needsReview` rather than crashing the audit.
 */

/** A single qualitative question for the judge to assess about one profile. */
export interface JudgeQuestion {
  /**
   * Stable identifier the engine uses to map the answer back to a section /
   * check. Echoed verbatim in the corresponding `JudgeAnswer.id`.
   */
  id: string;
  /** The section this question belongs to (e.g. 'headline', 'about'). */
  sectionId: string;
  /** The qualitative question the judge should answer. */
  question: string;
  /** The profile text the judge evaluates against (already redacted/trimmed). */
  context: string;
}

/** The batched judge request for ONE audit. One request → one Claude call. */
export interface JudgeRequest {
  /**
   * Opaque correlation id for logging only — NOT used for auth or lookup.
   * Lets cost logs be tied back to an audit without leaking PII.
   */
  auditId?: string;
  /**
   * The batched questions. All of them are assessed in a single Claude call;
   * the proxy never fans out per-section.
   */
  questions: JudgeQuestion[];
}

/** The judge's verdict for a single question. */
export interface JudgeAnswer {
  /** Matches the `JudgeQuestion.id` this answers. */
  id: string;
  /** Qualitative verdict the engine maps onto its scoring. */
  verdict: 'pass' | 'partial' | 'fail';
  /** One short sentence of rationale (kept terse — cost-per-audit money). */
  rationale: string;
  /**
   * 0–1 self-reported confidence. The engine can route low-confidence answers
   * to `needsReview` rather than trusting them blindly.
   */
  confidence: number;
}

/** Token + cost accounting for a single judge call, surfaced on success. */
export interface JudgeUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** Estimated USD cost of this call, for $/audit tracking. */
  costUsd: number;
}

/**
 * Why a judge call failed. Every value is something the engine can absorb by
 * falling back to `needsReview`.
 */
export type JudgeFailureReason =
  | 'invalid_request' // malformed/empty JudgeRequest (HTTP 400)
  | 'forbidden_origin' // Origin not in the allowlist (HTTP 403)
  | 'rate_limited' // per-IP/day cap exceeded (HTTP 429)
  | 'unconfigured' // ANTHROPIC_API_KEY missing on the server (HTTP 503)
  | 'upstream_error' // Claude returned an error (HTTP 502)
  | 'upstream_timeout' // Claude call exceeded the timeout (HTTP 504)
  | 'parse_error'; // Claude responded but the body wasn't usable (HTTP 502)

export interface JudgeSuccess {
  ok: true;
  answers: JudgeAnswer[];
  usage: JudgeUsage;
}

export interface JudgeFailure {
  ok: false;
  reason: JudgeFailureReason;
  /** Human-readable detail for logs/debugging — safe to ignore in the engine. */
  message?: string;
}

/** The proxy ALWAYS returns one of these — never an unhandled error. */
export type JudgeResponse = JudgeSuccess | JudgeFailure;
