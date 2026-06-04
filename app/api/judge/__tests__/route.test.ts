import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RATE_LIMIT_PER_DAY } from '@/lib/judge/config';
import { __resetRateLimiterForTests } from '@/lib/judge/rateLimit';
import type { JudgeResponse } from '@/lib/judge/types';

// Mock the upstream call so route tests never touch the network or the key.
vi.mock('@/lib/judge/callJudge', () => ({ callJudge: vi.fn() }));

import { POST } from '../route';
import { callJudge } from '@/lib/judge/callJudge';

const mockCall = vi.mocked(callJudge);

const ALLOWED_ORIGIN = 'https://app.test';
const OK_RESPONSE: JudgeResponse = {
  ok: true,
  answers: [{ id: 'q1', verdict: 'pass', rationale: 'ok', confidence: 0.9 }],
  usage: {
    model: 'claude-sonnet-4-6',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUsd: 0.0001,
  },
};

function makeRequest(opts: { origin?: string | null; ip?: string; body?: unknown } = {}): Request {
  const { origin = ALLOWED_ORIGIN, ip = '203.0.113.1', body } = opts;
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  if (origin) headers.origin = origin;
  return new Request('https://app.test/api/judge', {
    method: 'POST',
    headers,
    body: JSON.stringify(
      body ?? { questions: [{ id: 'q1', sectionId: 'headline', question: 'Specific?', context: 'CFO' }] },
    ),
  });
}

beforeEach(() => {
  process.env.JUDGE_ALLOWED_ORIGINS = ALLOWED_ORIGIN;
  process.env.ANTHROPIC_API_KEY = 'sk-test-key';
  __resetRateLimiterForTests();
  mockCall.mockReset().mockResolvedValue(OK_RESPONSE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/judge', () => {
  it('returns the JudgeResponse for a valid request from an allowed origin', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(OK_RESPONSE);
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it('rejects a disallowed origin with 403 and never calls the judge', async () => {
    const res = await POST(makeRequest({ origin: 'https://evil.test' }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ ok: false, reason: 'forbidden_origin' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('rejects a missing origin with 403', async () => {
    const res = await POST(makeRequest({ origin: null }));
    expect(res.status).toBe(403);
  });

  it('returns 429 once the per-IP/day limit is exceeded', async () => {
    const ip = '198.51.100.7';
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
      const ok = await POST(makeRequest({ ip }));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(makeRequest({ ip }));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('returns 400 for a malformed body (no questions)', async () => {
    const res = await POST(makeRequest({ body: { questions: [] } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, reason: 'invalid_request' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('returns 400 for an oversized context field and never calls the judge', async () => {
    const huge = 'x'.repeat(9_000); // > MAX_CONTEXT_CHARS (8000)
    const res = await POST(
      makeRequest({
        body: { questions: [{ id: 'q1', sectionId: 'headline', question: 'q?', context: huge }] },
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, reason: 'invalid_request' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('returns 400 for duplicate question ids', async () => {
    const res = await POST(
      makeRequest({
        body: {
          questions: [
            { id: 'dup', sectionId: 'headline', question: 'a?', context: 'x' },
            { id: 'dup', sectionId: 'about', question: 'b?', context: 'y' },
          ],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('returns 503 when ANTHROPIC_API_KEY is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false, reason: 'unconfigured' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('passes a structured upstream failure straight through (502, no crash)', async () => {
    mockCall.mockResolvedValue({ ok: false, reason: 'parse_error', message: 'bad body' });
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ ok: false, reason: 'parse_error' });
  });

  it('maps an upstream timeout to 504', async () => {
    mockCall.mockResolvedValue({ ok: false, reason: 'upstream_timeout' });
    const res = await POST(makeRequest());
    expect(res.status).toBe(504);
  });
});
