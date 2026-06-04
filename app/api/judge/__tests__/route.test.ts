import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';
import { __resetJudgeRateLimitForTests } from '@/lib/judge/rateLimit';

const VALID_REQUEST = {
  auditId: 'aud_test',
  judgeRequest: {
    headline: { text: 'Senior Engineer @ Acme — ships platforms for fintech.' },
    about: {
      text:
        'I ship developer-platform software for regulated fintech. Eight years on the same problem.',
    },
    rolesFamilyHint: 'engineering',
    rewriteTargets: ['headline'],
  },
};

const STRICT_OK_BODY = JSON.stringify({
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
    notes: 'Strong hook; could add an explicit CTA.',
  },
  buzzwords: { density: 'low', examples: [], notes: '' },
  rewrites: { headline: { before: 'Senior Engineer @ Acme', after: 'Senior Engineer @ Acme | ships platforms' } },
});

function makeAnthropicResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text }],
      usage: { input_tokens: 1000, output_tokens: 200 },
      stop_reason: 'end_turn',
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/judge — authoriseCaller', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.JUDGE_PROXY_SECRET = 'super-secret';
    process.env.JUDGE_ALLOWED_ORIGINS = 'https://linkedingrade.com,chrome-extension://abc';
    process.env.JUDGE_RATE_LIMIT_PER_DAY = '5';
    __resetJudgeRateLimitForTests();
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_ALLOWED_ORIGINS;
    delete process.env.JUDGE_RATE_LIMIT_PER_DAY;
    delete process.env.ANTHROPIC_API_KEY;
    __resetJudgeRateLimitForTests();
  });

  it('rejects a request with neither secret nor allowed origin (403)', async () => {
    const res = await POST(makeRequest(VALID_REQUEST));
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong secret AND no allowed origin', async () => {
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'wrong-secret' }),
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows a request with a valid shared secret (server-to-server path)', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('allows a request from an allow-listed origin (browser path)', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    const res = await POST(
      makeRequest(VALID_REQUEST, { origin: 'https://linkedingrade.com' }),
    );
    expect(res.status).toBe(200);
  });

  it('rejects a request from an origin NOT on the allowlist (403)', async () => {
    const res = await POST(
      makeRequest(VALID_REQUEST, { origin: 'https://evil.example.com' }),
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/judge — validation', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.JUDGE_PROXY_SECRET = 'super-secret';
    process.env.JUDGE_RATE_LIMIT_PER_DAY = '5';
    __resetJudgeRateLimitForTests();
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_RATE_LIMIT_PER_DAY;
    delete process.env.ANTHROPIC_API_KEY;
    __resetJudgeRateLimitForTests();
  });

  it('rejects invalid JSON with 400', async () => {
    const req = new Request('http://localhost/api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-judge-auth': 'super-secret' },
      body: '{not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects a body with no judgeRequest at all (400)', async () => {
    const res = await POST(makeRequest({ auditId: 'x' }, { 'x-judge-auth': 'super-secret' }));
    expect(res.status).toBe(400);
  });

  it('rejects a body with judgeRequest that has neither headline nor about (400)', async () => {
    const res = await POST(
      makeRequest(
        { auditId: 'x', judgeRequest: { rolesFamilyHint: 'engineering' } },
        { 'x-judge-auth': 'super-secret' },
      ),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/judge — graceful degradation', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.JUDGE_PROXY_SECRET = 'super-secret';
    process.env.JUDGE_RATE_LIMIT_PER_DAY = '5';
    __resetJudgeRateLimitForTests();
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_RATE_LIMIT_PER_DAY;
    delete process.env.ANTHROPIC_API_KEY;
    __resetJudgeRateLimitForTests();
  });

  it('returns judge_unavailable when Anthropic responds 5xx — HTTP 200 with status field', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse('upstream broken', 502));
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('judge_unavailable');
  });

  it('returns judge_unavailable on a malformed upstream response (unparseable JSON)', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse('not JSON at all'));
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('judge_unavailable');
  });

  it('returns judge_unavailable when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason?: string };
    expect(body.status).toBe('judge_unavailable');
    expect(body.reason).toBe('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns judge_unavailable when rate-limited; no upstream call is made', async () => {
    process.env.JUDGE_RATE_LIMIT_PER_DAY = '1';
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    // First call succeeds.
    const ok = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { status: string }).status).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Second call is rate-limited.
    const limited = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    expect(limited.status).toBe(200);
    const body = (await limited.json()) as { status: string; reason?: string };
    expect(body.status).toBe('judge_unavailable');
    expect(body.reason).toBe('rate_limited');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no second upstream call
  });
});

describe('POST /api/judge — one batched call per audit', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.JUDGE_PROXY_SECRET = 'super-secret';
    process.env.JUDGE_RATE_LIMIT_PER_DAY = '5';
    __resetJudgeRateLimitForTests();
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_RATE_LIMIT_PER_DAY;
    delete process.env.ANTHROPIC_API_KEY;
    __resetJudgeRateLimitForTests();
  });

  it('makes exactly ONE Anthropic call per audit (Headline + About batched)', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('returns the parsed judgeResponse with usage data on success', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    const body = (await res.json()) as {
      status: string;
      judgeResponse: { headline?: unknown; about?: unknown };
      usage: { inputTokens: number; outputTokens: number; estimatedUsd: number };
      auditId: string | null;
    };
    expect(body.status).toBe('ok');
    expect(body.judgeResponse.headline).toBeDefined();
    expect(body.judgeResponse.about).toBeDefined();
    expect(body.usage.inputTokens).toBe(1000);
    expect(body.usage.outputTokens).toBe(200);
    expect(body.usage.estimatedUsd).toBeGreaterThan(0);
    expect(body.auditId).toBe('aud_test');
  });
});
