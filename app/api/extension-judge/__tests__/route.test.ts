import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPTIONS, POST } from '../route';
import { __resetJudgeRateLimitForTests } from '@/lib/judge/rateLimit';

const EXT_ORIGIN = 'chrome-extension://cnnnbdgkiblailjaacdpkbhmeeaijpao';

const VALID_REQUEST = {
  auditId: 'aud_ext',
  judgeRequest: {
    headline: { text: 'Senior Engineer @ Acme — ships platforms for fintech.' },
    about: { text: 'I ship developer-platform software for regulated fintech.' },
    rolesFamilyHint: 'engineering',
    rewriteTargets: ['headline'],
  },
};

const SAMPLE_JUDGE = {
  headline: {
    hasCliche: false,
    hasIdentity: true,
    hasDomain: true,
    hasCredibleSpecific: true,
    mobileSafe: true,
    notes: 'Concrete identity + domain.',
  },
  about: {
    hasHook: true,
    hasRange: true,
    hasCTA: false,
    voiceIsHuman: true,
    buzzwordDensity: 'low',
    notes: 'Strong hook.',
  },
};

/** The proxy's response shape (what `/api/judge` returns to HttpJudge). */
function makeProxyOk(judge: unknown = SAMPLE_JUDGE) {
  return new Response(
    JSON.stringify({
      status: 'ok',
      judgeResponse: judge,
      usage: { inputTokens: 1000, outputTokens: 200, estimatedUsd: 0.0097 },
      auditId: 'aud_ext',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/extension-judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const fetchSpy = vi.spyOn(globalThis, 'fetch');

beforeEach(() => {
  fetchSpy.mockReset();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.IP_HASH_PEPPER;
  delete process.env.EXTENSION_JUDGE_ALLOWED_ORIGINS;
  delete process.env.EXTENSION_JUDGE_RATE_LIMIT_PER_DAY;
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  process.env.JUDGE_PROXY_SECRET = 'super-secret';
  __resetJudgeRateLimitForTests();
});

afterEach(() => {
  delete process.env.JUDGE_PROXY_SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.EXTENSION_JUDGE_ALLOWED_ORIGINS;
  delete process.env.EXTENSION_JUDGE_RATE_LIMIT_PER_DAY;
  __resetJudgeRateLimitForTests();
});

describe('OPTIONS /api/extension-judge — CORS preflight', () => {
  it('returns permissive headers for the extension origin (no X-Judge-Auth, it is secretless)', async () => {
    const res = await OPTIONS(
      new Request('http://localhost/api/extension-judge', {
        method: 'OPTIONS',
        headers: { origin: EXT_ORIGIN },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });

  it('omits Access-Control-Allow-Origin for a non-extension origin', async () => {
    const res = await OPTIONS(
      new Request('http://localhost/api/extension-judge', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example.com' },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('POST /api/extension-judge — origin gate', () => {
  it('rejects a request with no Origin header (403) — the extension always sends one', async () => {
    const res = await POST(makeRequest(VALID_REQUEST));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a non-extension origin (403)', async () => {
    const res = await POST(makeRequest(VALID_REQUEST, { origin: 'https://evil.example.com' }));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('honours EXTENSION_JUDGE_ALLOWED_ORIGINS override', async () => {
    process.env.EXTENSION_JUDGE_ALLOWED_ORIGINS = 'chrome-extension://devbuildid';
    fetchSpy.mockResolvedValueOnce(makeProxyOk());
    const res = await POST(
      makeRequest(VALID_REQUEST, { origin: 'chrome-extension://devbuildid' }),
    );
    expect(res.status).toBe(200);
    // The default published origin is no longer allowed once overridden.
    const res2 = await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(res2.status).toBe(403);
  });
});

describe('POST /api/extension-judge — relay', () => {
  it('relays a valid request to the proxy and returns the JudgeResponse', async () => {
    fetchSpy.mockResolvedValueOnce(makeProxyOk());
    const res = await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      judgeResponse?: typeof SAMPLE_JUDGE;
      usage?: { estimatedUsd: number };
    };
    expect(body.status).toBe('ok');
    expect(body.judgeResponse?.headline?.hasIdentity).toBe(true);
    expect(body.usage?.estimatedUsd).toBe(0.0097);
    // CORS header echoes the extension origin so the browser surfaces the body.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN);
  });

  it('sends X-Judge-Auth to the proxy (secret added server-side, never by the extension)', async () => {
    fetchSpy.mockResolvedValueOnce(makeProxyOk());
    await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-judge-auth')).toBe('super-secret');
  });

  it('degrades to judge_unavailable (200) when the proxy reports unavailable', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'judge_unavailable', reason: 'rate_limited' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('judge_unavailable');
  });

  it('degrades to judge_unavailable (200) when the proxy returns a non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    const res = await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('judge_unavailable');
  });

  it('returns judge_unavailable not_configured when the secret is unset — no relay attempted', async () => {
    delete process.env.JUDGE_PROXY_SECRET;
    const res = await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason: string };
    expect(body.status).toBe('judge_unavailable');
    expect(body.reason).toBe('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/extension-judge — input caps & validation', () => {
  it('rejects invalid JSON with 400', async () => {
    const req = new Request('http://localhost/api/extension-judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: EXT_ORIGIN },
      body: '{not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized headline (400) — no relay/Anthropic spend', async () => {
    const res = await POST(
      makeRequest(
        { judgeRequest: { headline: { text: 'x'.repeat(501) } } },
        { origin: EXT_ORIGIN },
      ),
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a judgeRequest with neither headline nor about (400)', async () => {
    const res = await POST(
      makeRequest({ judgeRequest: { rolesFamilyHint: 'eng' } }, { origin: EXT_ORIGIN }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/extension-judge — per-IP rate limit', () => {
  it('rate-limits after the daily cap and returns judge_unavailable (200)', async () => {
    process.env.EXTENSION_JUDGE_RATE_LIMIT_PER_DAY = '1';
    fetchSpy.mockResolvedValue(makeProxyOk());

    const first = await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(first.status).toBe(200);
    expect(((await first.json()) as { status: string }).status).toBe('ok');

    const second = await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(second.status).toBe(200);
    const body = (await second.json()) as { status: string; reason: string };
    expect(body.status).toBe('judge_unavailable');
    expect(body.reason).toBe('rate_limited');
    // Only the first (allowed) call reached the proxy.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('counts rejected (invalid) requests against the budget — rate limit precedes parsing (Codex P2)', async () => {
    process.env.EXTENSION_JUDGE_RATE_LIMIT_PER_DAY = '1';
    // First request is malformed JSON: it must still consume the slot.
    const bad = new Request('http://localhost/api/extension-judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: EXT_ORIGIN },
      body: '{not json',
    });
    const firstRes = await POST(bad);
    expect(firstRes.status).toBe(400);

    // A subsequent valid request from the same (no-IP) bucket is now
    // rate-limited — the invalid request already spent the quota.
    fetchSpy.mockResolvedValue(makeProxyOk());
    const secondRes = await POST(makeRequest(VALID_REQUEST, { origin: EXT_ORIGIN }));
    expect(secondRes.status).toBe(200);
    expect(((await secondRes.json()) as { status: string }).status).toBe('judge_unavailable');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
