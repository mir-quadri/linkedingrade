import { describe, expect, it, vi } from 'vitest';

import { HttpJudge, type HttpJudgeOutcome } from '../httpJudge';
import type { JudgeRequest, JudgeResponse } from '@/lib/engine/types/judge';

const PROXY_URL = 'https://example.test/api/judge';
const PROXY_SECRET = 'shh-shared';

const SAMPLE_REQUEST: JudgeRequest = {
  headline: { text: 'Senior Engineer @ Acme' },
  about: { text: 'I ship platforms that actually work.' },
  rolesFamilyHint: 'engineering',
  rewriteTargets: ['headline', 'about'],
};

const SAMPLE_JUDGE_RESPONSE: JudgeResponse = {
  headline: {
    hasCliche: false,
    hasIdentity: true,
    hasDomain: true,
    hasCredibleSpecific: true,
    mobileSafe: true,
    notes: 'Concrete identity + domain.',
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeJudge(opts: {
  fetchImpl?: typeof fetch;
  onResult?: (o: HttpJudgeOutcome) => void;
  timeoutMs?: number;
  auditId?: string | null;
}): HttpJudge {
  return new HttpJudge({
    proxyUrl: PROXY_URL,
    proxySecret: PROXY_SECRET,
    auditId: opts.auditId ?? 'aud_test',
    timeoutMs: opts.timeoutMs,
    fetchImpl: opts.fetchImpl,
    onResult: opts.onResult,
  });
}

describe('HttpJudge — happy path', () => {
  it('returns the proxy `judgeResponse` on a 200 ok', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        judgeResponse: SAMPLE_JUDGE_RESPONSE,
        usage: { inputTokens: 1000, outputTokens: 200, estimatedUsd: 0.006 },
        auditId: 'aud_test',
      }),
    );
    const outcomes: HttpJudgeOutcome[] = [];
    const judge = makeJudge({ fetchImpl, onResult: (o) => outcomes.push(o) });
    const response = await judge.evaluate(SAMPLE_REQUEST);
    expect(response).toEqual(SAMPLE_JUDGE_RESPONSE);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('ok');
    expect(outcomes[0]!.usage?.estimatedUsd).toBe(0.006);
    expect(outcomes[0]!.auditId).toBe('aud_test');
  });

  it('sends X-Judge-Auth and the JSON body with auditId + judgeRequest', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ status: 'ok', judgeResponse: SAMPLE_JUDGE_RESPONSE }),
    );
    const judge = makeJudge({ fetchImpl, auditId: 'aud_alpha' });
    await judge.evaluate(SAMPLE_REQUEST);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(PROXY_URL);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-Judge-Auth']).toBe(PROXY_SECRET);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init?.body)) as {
      auditId: string;
      judgeRequest: JudgeRequest;
    };
    expect(body.auditId).toBe('aud_alpha');
    expect(body.judgeRequest.headline?.text).toBe('Senior Engineer @ Acme');
    expect(body.judgeRequest.rewriteTargets).toEqual(['headline', 'about']);
  });
});

describe('HttpJudge — graceful degradation (NEVER throws, always returns {})', () => {
  it('returns `{}` when the proxy responds 200 with status: judge_unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ status: 'judge_unavailable', reason: 'rate_limited' }),
    );
    const outcomes: HttpJudgeOutcome[] = [];
    const judge = makeJudge({ fetchImpl, onResult: (o) => outcomes.push(o) });
    const response = await judge.evaluate(SAMPLE_REQUEST);
    expect(response).toEqual({});
    expect(outcomes[0]!.status).toBe('judge_unavailable');
    expect(outcomes[0]!.reason).toBe('rate_limited');
  });

  it('returns `{}` when the proxy responds 403 (bad auth)', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: 'Missing or invalid X-Judge-Auth header.' }, 403),
    );
    const outcomes: HttpJudgeOutcome[] = [];
    const judge = makeJudge({ fetchImpl, onResult: (o) => outcomes.push(o) });
    const response = await judge.evaluate(SAMPLE_REQUEST);
    expect(response).toEqual({});
    expect(outcomes[0]!.status).toBe('judge_unavailable');
    expect(outcomes[0]!.reason).toBe('http_403');
    expect(outcomes[0]!.httpStatus).toBe(403);
  });

  it('returns `{}` when the proxy 5xxes', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('upstream', { status: 502 }));
    const outcomes: HttpJudgeOutcome[] = [];
    const judge = makeJudge({ fetchImpl, onResult: (o) => outcomes.push(o) });
    const response = await judge.evaluate(SAMPLE_REQUEST);
    expect(response).toEqual({});
    expect(outcomes[0]!.status).toBe('judge_unavailable');
    expect(outcomes[0]!.reason).toBe('http_502');
  });

  it('returns `{}` when fetch throws (network/DNS failure)', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.test'));
    const outcomes: HttpJudgeOutcome[] = [];
    const judge = makeJudge({ fetchImpl, onResult: (o) => outcomes.push(o) });
    const response = await judge.evaluate(SAMPLE_REQUEST);
    expect(response).toEqual({});
    expect(outcomes[0]!.status).toBe('judge_unavailable');
    expect(outcomes[0]!.reason).toMatch(/ENOTFOUND/);
  });

  it('returns `{}` and reports reason=timeout when the request aborts', async () => {
    // Simulate a request that never resolves — the AbortController fires
    // and `fetch` rejects with an AbortError.
    const fetchImpl: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    const outcomes: HttpJudgeOutcome[] = [];
    const judge = makeJudge({ fetchImpl, onResult: (o) => outcomes.push(o), timeoutMs: 25 });
    const response = await judge.evaluate(SAMPLE_REQUEST);
    expect(response).toEqual({});
    expect(outcomes[0]!.status).toBe('judge_unavailable');
    expect(outcomes[0]!.reason).toBe('timeout');
  });

  it('still resolves to `{}` if the onResult observability hook itself throws', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ status: 'judge_unavailable', reason: 'rate_limited' }),
    );
    const judge = makeJudge({
      fetchImpl,
      onResult: () => {
        throw new Error('observability blew up');
      },
    });
    // The whole point of `report()`'s try/catch — a broken metrics
    // sidecar must never crash the audit.
    await expect(judge.evaluate(SAMPLE_REQUEST)).resolves.toEqual({});
  });
});

describe('HttpJudge — forwarded client headers (Codex Round 1 P1)', () => {
  it('forwards `x-forwarded-for` and `x-real-ip` so the proxy rate-limits per END-USER, not per Vercel-to-Vercel inner request', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ status: 'ok', judgeResponse: SAMPLE_JUDGE_RESPONSE }),
      );
    const judge = new HttpJudge({
      proxyUrl: PROXY_URL,
      proxySecret: PROXY_SECRET,
      auditId: 'aud_fwd',
      fetchImpl,
      forwardHeaders: {
        'x-forwarded-for': '203.0.113.99',
        'x-real-ip': '203.0.113.99',
      },
    });
    await judge.evaluate(SAMPLE_REQUEST);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-forwarded-for']).toBe('203.0.113.99');
    expect(headers['x-real-ip']).toBe('203.0.113.99');
    // Auth + content-type still set by HttpJudge, not overridden by caller.
    expect(headers['X-Judge-Auth']).toBe(PROXY_SECRET);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('a caller-supplied forwardHeaders entry CANNOT override X-Judge-Auth or Content-Type', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ status: 'ok', judgeResponse: SAMPLE_JUDGE_RESPONSE }),
      );
    const judge = new HttpJudge({
      proxyUrl: PROXY_URL,
      proxySecret: PROXY_SECRET,
      auditId: 'aud_safety',
      fetchImpl,
      forwardHeaders: {
        // Hostile config — must NOT win.
        'X-Judge-Auth': 'attacker-secret',
        'Content-Type': 'text/plain',
        'x-forwarded-for': '203.0.113.1',
      },
    });
    await judge.evaluate(SAMPLE_REQUEST);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Judge-Auth']).toBe(PROXY_SECRET);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-forwarded-for']).toBe('203.0.113.1');
  });
});

describe('HttpJudge — one call per audit (cost invariant)', () => {
  it('issues exactly ONE fetch per evaluate() — the proxy contract is "one batched call per audit"', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ status: 'ok', judgeResponse: SAMPLE_JUDGE_RESPONSE }),
    );
    const judge = makeJudge({ fetchImpl });
    await judge.evaluate(SAMPLE_REQUEST);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
