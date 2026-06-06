import type { Judge, JudgeRequest, JudgeResponse } from '@/lib/engine/types/judge';

/**
 * Default caller-side timeout for HttpJudge. Exported so tests and
 * route code share the constant. MUST sit above
 * `ANTHROPIC_DEFAULT_TIMEOUT_MS` from `anthropicClient.ts` — see
 * `__tests__/timeoutInvariants.test.ts`.
 */
export const HTTP_JUDGE_DEFAULT_TIMEOUT_MS = 35_000;

export interface HttpJudgeOptions {
  /** Absolute URL of the `/api/judge` proxy. */
  proxyUrl: string;
  /** Value of `X-Judge-Auth` — must match the proxy's `JUDGE_PROXY_SECRET`. */
  proxySecret: string;
  /** Stamped on outgoing requests so proxy logs correlate audit ↔ judge call. */
  auditId?: string | null;
  /** Caller-side timeout. Sits ABOVE the proxy's upstream Anthropic
   * timeout (30s as of the timeout raise) so the upstream times out
   * first and returns a structured `judge_unavailable`; the caller
   * timeout is the belt-and-suspenders cap that also covers DNS,
   * TLS, and the wait for the proxy response. Defaults to 35_000ms. */
  timeoutMs?: number;
  /**
   * Forwarded headers identifying the originating end-user — typically
   * `x-forwarded-for` and `x-real-ip` from the inbound `/api/audit`
   * request. The proxy's per-IP daily rate limit reads these to
   * partition audits by real caller; without forwarding, every web
   * audit collapses into the Vercel-to-Vercel `no-ip` bucket and
   * shares one `JUDGE_RATE_LIMIT_PER_DAY` quota for all users.
   * (Codex Round 1 P1.)
   *
   * Keys are case-normalised by `fetch`; supply them however you like.
   * `X-Judge-Auth` and `Content-Type` cannot be overridden — the
   * client always sets those itself.
   */
  forwardHeaders?: Record<string, string>;
  /** Test seam — overridable so unit tests can drive the client without
   * touching the real network. */
  fetchImpl?: typeof fetch;
  /** Observability hook — called exactly once per `evaluate()` with the
   * outcome (status, usage, elapsed). Exceptions thrown by the hook are
   * swallowed: observability must never break the audit. */
  onResult?: (outcome: HttpJudgeOutcome) => void;
}

export interface HttpJudgeOutcome {
  status: 'ok' | 'judge_unavailable';
  /** Reason string when status is `judge_unavailable` — e.g. `http_503`,
   * `timeout`, the proxy's `rate_limited`, a thrown error message. */
  reason?: string;
  /** Populated on `ok` — passed through from the proxy for cost logging. */
  usage?: { inputTokens: number; outputTokens: number; estimatedUsd: number };
  auditId: string | null;
  elapsedMs: number;
  /** Present for any path that completed an HTTP round-trip. */
  httpStatus?: number;
}

/**
 * HTTP client implementing `Judge` against the `/api/judge` proxy.
 *
 * Sends the shared `X-Judge-Auth` secret on every call. Treats every
 * failure mode (HTTP non-2xx, proxy `judge_unavailable`, network error,
 * timeout) the same: `evaluate` resolves to `{}` and the scoring engine
 * keeps `needsReview: true` for every section that would have needed
 * the judge. NEVER throws — graceful degradation is the contract: a
 * proxy outage must not 500 the audit. See B3 brief.
 */
export class HttpJudge implements Judge {
  constructor(private readonly opts: HttpJudgeOptions) {}

  async evaluate(req: JudgeRequest): Promise<JudgeResponse> {
    const startedAt = Date.now();
    const timeoutMs = this.opts.timeoutMs ?? HTTP_JUDGE_DEFAULT_TIMEOUT_MS;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const auditId = this.opts.auditId ?? null;
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    console.log(
      `[HttpJudge] TRACE evaluate-start auditId=${auditId} proxyUrl=${this.opts.proxyUrl} timeoutMs=${timeoutMs}`,
    );
    try {
      const headers: Record<string, string> = {
        // Forwarded client-identifying headers go FIRST so our own
        // auth + content-type can't be silently overridden by a
        // caller-supplied entry.
        ...(this.opts.forwardHeaders ?? {}),
        'Content-Type': 'application/json',
        'X-Judge-Auth': this.opts.proxySecret,
      };
      console.log(`[HttpJudge] TRACE pre-fetch auditId=${auditId}`);
      const res = await fetchImpl(this.opts.proxyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ auditId, judgeRequest: req }),
        signal: ac.signal,
      });
      console.log(
        `[HttpJudge] TRACE post-fetch auditId=${auditId} httpStatus=${res.status} ok=${res.ok} elapsedMs=${Date.now() - startedAt}`,
      );
      if (!res.ok) {
        this.report({
          status: 'judge_unavailable',
          reason: `http_${res.status}`,
          auditId,
          elapsedMs: Date.now() - startedAt,
          httpStatus: res.status,
        });
        return {};
      }
      console.log(`[HttpJudge] TRACE pre-json auditId=${auditId}`);
      const body = (await res.json()) as {
        status?: 'ok' | 'judge_unavailable';
        judgeResponse?: JudgeResponse;
        reason?: string;
        usage?: { inputTokens: number; outputTokens: number; estimatedUsd: number };
        auditId?: string | null;
      };
      console.log(
        `[HttpJudge] TRACE post-json auditId=${auditId} bodyStatus=${body.status ?? 'undefined'} hasJudgeResponse=${!!body.judgeResponse}`,
      );
      if (body.status === 'ok' && body.judgeResponse) {
        this.report({
          status: 'ok',
          usage: body.usage,
          auditId,
          elapsedMs: Date.now() - startedAt,
          httpStatus: res.status,
        });
        return body.judgeResponse;
      }
      this.report({
        status: 'judge_unavailable',
        reason: body.reason ?? 'unknown',
        auditId,
        elapsedMs: Date.now() - startedAt,
        httpStatus: res.status,
      });
      return {};
    } catch (err) {
      const reason =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'timeout'
            : err.message
          : String(err);
      console.log(
        `[HttpJudge] TRACE catch auditId=${auditId} errName=${err instanceof Error ? err.name : 'non-Error'} reason=${reason} elapsedMs=${Date.now() - startedAt}`,
      );
      this.report({
        status: 'judge_unavailable',
        reason,
        auditId,
        elapsedMs: Date.now() - startedAt,
      });
      return {};
    } finally {
      clearTimeout(timer);
    }
  }

  private report(outcome: HttpJudgeOutcome): void {
    try {
      this.opts.onResult?.(outcome);
    } catch {
      // Observability hooks must never break the audit.
    }
  }
}
