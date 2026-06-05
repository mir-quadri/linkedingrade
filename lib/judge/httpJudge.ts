import type { Judge, JudgeRequest, JudgeResponse } from '@/lib/engine/types/judge';

export interface HttpJudgeOptions {
  /** Absolute URL of the `/api/judge` proxy. */
  proxyUrl: string;
  /** Value of `X-Judge-Auth` — must match the proxy's `JUDGE_PROXY_SECRET`. */
  proxySecret: string;
  /** Stamped on outgoing requests so proxy logs correlate audit ↔ judge call. */
  auditId?: string | null;
  /** Caller-side timeout. Proxy enforces its own ~12s upstream timeout — this
   * is the request-level cap that covers DNS, TLS, and the wait for the
   * proxy response together. */
  timeoutMs?: number;
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
    const timeoutMs = this.opts.timeoutMs ?? 15_000;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const auditId = this.opts.auditId ?? null;
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(this.opts.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Judge-Auth': this.opts.proxySecret,
        },
        body: JSON.stringify({ auditId, judgeRequest: req }),
        signal: ac.signal,
      });
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
      const body = (await res.json()) as {
        status?: 'ok' | 'judge_unavailable';
        judgeResponse?: JudgeResponse;
        reason?: string;
        usage?: { inputTokens: number; outputTokens: number; estimatedUsd: number };
        auditId?: string | null;
      };
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
