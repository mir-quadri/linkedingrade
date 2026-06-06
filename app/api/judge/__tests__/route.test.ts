import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPTIONS, POST } from '../route';
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

  it('rejects an allow-listed origin alone without the secret (Codex Round 3 P1)', async () => {
    // Origin headers are trivially spoofable by non-browser clients
    // (curl, scripts), so an Origin allowlist alone cannot be the auth
    // gate — without the secret, the endpoint would degrade to an
    // unauthenticated paid Anthropic proxy up to the per-IP rate
    // limit. EVERY caller must present X-Judge-Auth; the Origin
    // allowlist is CORS-only.
    const res = await POST(
      makeRequest(VALID_REQUEST, { origin: 'https://linkedingrade.com' }),
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows a request from an allow-listed origin WHEN it also presents the secret', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    const res = await POST(
      makeRequest(VALID_REQUEST, {
        origin: 'https://linkedingrade.com',
        'x-judge-auth': 'super-secret',
      }),
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

  it('rejects a headline that exceeds the input-text cap (Codex P2) — no upstream Anthropic call', async () => {
    // Without an input-text cap a malformed browser caller could hand
    // megabytes of text to Anthropic in a single audit, blowing the
    // per-IP daily budget before the rate limit (which counts calls,
    // not tokens) could help. Generate a string well past 500 chars.
    const huge = 'x'.repeat(10_000);
    const res = await POST(
      makeRequest(
        { auditId: 'x', judgeRequest: { headline: { text: huge } } },
        { 'x-judge-auth': 'super-secret' },
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/headline.*cap/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an about that exceeds the input-text cap (Codex P2) — no upstream Anthropic call', async () => {
    const huge = 'y'.repeat(100_000);
    const res = await POST(
      makeRequest(
        { auditId: 'x', judgeRequest: { about: { text: huge } } },
        { 'x-judge-auth': 'super-secret' },
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/about.*cap/);
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it('falls back to a real Anthropic model id when JUDGE_MODEL is unset (Codex P1)', async () => {
    // The first draft defaulted to `claude-sonnet-4-7` — an internal
    // Claude Code name, not a public Anthropic API id. That would
    // 404 on every live call, making the proxy look configured but
    // silently degrade to judge_unavailable. The default must be a
    // currently-supported public Sonnet 4.x model id.
    delete process.env.JUDGE_MODEL;
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    await POST(makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }));
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(init.body as string) as { model: string };
    // The exact id is configurable, but it must NOT be the broken
    // internal naming convention.
    expect(sent.model).not.toBe('claude-sonnet-4-7');
    // It should be a recognisably-Anthropic public id. Match the
    // `claude-sonnet-4-<minor>` shape that Anthropic publishes
    // (alias OR dated form). The test deliberately allows future
    // version bumps; the regression we lock in is "no broken
    // internal name."
    expect(sent.model).toMatch(/^claude-sonnet-4-/);
  });
});

describe('POST /api/judge — rate-limit key partitioning (Codex Round 3 P2)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.IP_HASH_PEPPER;
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.JUDGE_PROXY_SECRET = 'super-secret';
    process.env.JUDGE_RATE_LIMIT_PER_DAY = '1';
    __resetJudgeRateLimitForTests();
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_RATE_LIMIT_PER_DAY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.IP_HASH_PEPPER;
    __resetJudgeRateLimitForTests();
  });

  it('rate-limited warn log never includes the raw IP (Codex Round 5 P2)', async () => {
    // With pepper unset, rateLimitKey embeds raw IP; the over-limit
    // console.warn must NOT echo that IP into Vercel/runtime logs
    // (which are persistent). Same `hashIp` contract that keeps raw
    // IPs out of KV applies to log output.
    fetchSpy.mockResolvedValue(makeAnthropicResponse(STRICT_OK_BODY));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Burn the single quota for this IP.
      await POST(
        makeRequest(VALID_REQUEST, {
          'x-judge-auth': 'super-secret',
          'x-vercel-forwarded-for': '203.0.113.42',
        }),
      );
      // Second call → over limit → warn fires.
      await POST(
        makeRequest(VALID_REQUEST, {
          'x-judge-auth': 'super-secret',
          'x-vercel-forwarded-for': '203.0.113.42',
        }),
      );
      const logged = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('rate-limited');
      // Raw IP MUST NOT appear in the warn output. Neither the IP
      // itself nor the `raw:` prefix shape that carries it.
      expect(logged).not.toContain('203.0.113.42');
      expect(logged).not.toContain('judge:raw:');
      // Diagnostic signal still useful — the shape is logged.
      expect(logged).toMatch(/keyShape=(hash|raw|no-ip)/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('different IPs land in different buckets even when IP_HASH_PEPPER is unset', async () => {
    // With pepper missing, hashIp() returns null. The earlier route
    // collapsed every caller into a single literal `unhashed` bucket,
    // so ONE deployment missing that env var or one server-to-server
    // caller without an IP could exhaust the daily budget for ALL
    // users. Fix: when no pepper, key by raw IP (still per-IP; never
    // exposed beyond the 25h KV window).
    // A Response body is single-read, so each fetch call needs its own
    // Response instance — mockImplementation factory, not mockResolvedValue.
    fetchSpy.mockImplementation(() => Promise.resolve(makeAnthropicResponse(STRICT_OK_BODY)));

    // First IP — uses its one allowed call.
    const r1 = await POST(
      makeRequest(VALID_REQUEST, {
        'x-judge-auth': 'super-secret',
        'x-vercel-forwarded-for': '203.0.113.1',
      }),
    );
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { status: string }).status).toBe('ok');

    // First IP — second call is rate-limited.
    const r1b = await POST(
      makeRequest(VALID_REQUEST, {
        'x-judge-auth': 'super-secret',
        'x-vercel-forwarded-for': '203.0.113.1',
      }),
    );
    expect(((await r1b.json()) as { status: string; reason?: string }).reason).toBe(
      'rate_limited',
    );

    // Second IP — independent bucket; gets its OWN first call.
    const r2 = await POST(
      makeRequest(VALID_REQUEST, {
        'x-judge-auth': 'super-secret',
        'x-vercel-forwarded-for': '203.0.113.2',
      }),
    );
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as { status: string }).status).toBe('ok');
  });
});

describe('OPTIONS /api/judge — CORS preflight (Codex P2)', () => {
  beforeEach(() => {
    process.env.JUDGE_ALLOWED_ORIGINS =
      'https://linkedingrade.com,chrome-extension://abc';
  });
  afterEach(() => {
    delete process.env.JUDGE_ALLOWED_ORIGINS;
  });

  it('responds 204 with full CORS-allow headers for an allow-listed origin', async () => {
    const res = await OPTIONS(
      new Request('http://localhost/api/judge', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://linkedingrade.com',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-judge-auth',
        },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://linkedingrade.com');
    expect(res.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    const allowHeaders = res.headers.get('access-control-allow-headers') ?? '';
    expect(allowHeaders).toContain('Content-Type');
    expect(allowHeaders).toContain('X-Judge-Auth');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('responds 204 WITHOUT Access-Control-Allow-Origin for a non-allow-listed origin — browser blocks the request', async () => {
    const res = await OPTIONS(
      new Request('http://localhost/api/judge', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example.com' },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('responds 204 with no origin header on a same-origin / server preflight', async () => {
    const res = await OPTIONS(
      new Request('http://localhost/api/judge', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('POST /api/judge — CORS response headers (Codex P2)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.JUDGE_PROXY_SECRET = 'super-secret';
    process.env.JUDGE_ALLOWED_ORIGINS =
      'https://linkedingrade.com,chrome-extension://abc';
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

  it('successful response carries Access-Control-Allow-Origin echoing the allow-listed origin', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    const res = await POST(
      makeRequest(VALID_REQUEST, {
        origin: 'https://linkedingrade.com',
        'x-judge-auth': 'super-secret',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://linkedingrade.com');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('judge_unavailable response from a browser caller still includes CORS headers', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse('not JSON'));
    const res = await POST(
      makeRequest(VALID_REQUEST, {
        origin: 'https://linkedingrade.com',
        'x-judge-auth': 'super-secret',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('judge_unavailable');
    // Without the CORS header on the degraded response, the browser
    // would surface a generic "CORS error" instead of the structured
    // `judge_unavailable` body — defeating the graceful-fallback
    // contract on the browser path.
    expect(res.headers.get('access-control-allow-origin')).toBe('https://linkedingrade.com');
  });

  it('403 to an allow-listed origin without secret STILL carries CORS headers so the browser can read the reason', async () => {
    // Codex Round 3 P1: secret-required policy. A browser caller from
    // an allow-listed origin that forgets the X-Judge-Auth header
    // should get a CORS-decorated 403 so the JS caller can surface
    // the "Missing or invalid X-Judge-Auth header." reason instead of
    // a generic "CORS error" in the devtools console.
    const res = await POST(
      makeRequest(VALID_REQUEST, { origin: 'https://linkedingrade.com' }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://linkedingrade.com');
  });

  it('server-to-server response (no Origin header) carries NO CORS headers — they would weaken the contract', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(STRICT_OK_BODY));
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('POST /api/judge — trusted-relay rate-limit skip', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    fetchSpy.mockReset();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.JUDGE_PROXY_SECRET = 'super-secret';
    process.env.JUDGE_RATE_LIMIT_PER_DAY = '1';
    __resetJudgeRateLimitForTests();
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_RATE_LIMIT_PER_DAY;
    delete process.env.ANTHROPIC_API_KEY;
    __resetJudgeRateLimitForTests();
  });

  it('bypasses the per-IP limit when a secret-authenticated caller sends X-Judge-Skip-Rate-Limit', async () => {
    // Fresh Response per call — a body can only be read once.
    fetchSpy.mockImplementation(async () => makeAnthropicResponse(STRICT_OK_BODY));
    // Limit is 1/day, but two skip-flagged calls both succeed — the
    // proxy never consumes the judge bucket for trusted relayed traffic.
    for (let i = 0; i < 2; i++) {
      const res = await POST(
        makeRequest(VALID_REQUEST, {
          'x-judge-auth': 'super-secret',
          'x-judge-skip-rate-limit': '1',
        }),
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as { status: string }).status).toBe('ok');
    }
  });

  it('does NOT let the skip header bypass auth — no secret still 403s', async () => {
    const res = await POST(
      makeRequest(VALID_REQUEST, { 'x-judge-skip-rate-limit': '1' }),
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still limits normal (non-skip) callers — the skip is opt-in', async () => {
    fetchSpy.mockResolvedValue(makeAnthropicResponse(STRICT_OK_BODY));
    const first = await POST(makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }));
    expect(first.status).toBe(200);
    const second = await POST(makeRequest(VALID_REQUEST, { 'x-judge-auth': 'super-secret' }));
    expect(second.status).toBe(200);
    // Limit is 1; the second non-skip call degrades to judge_unavailable.
    expect(((await second.json()) as { status: string }).status).toBe('judge_unavailable');
  });
});
