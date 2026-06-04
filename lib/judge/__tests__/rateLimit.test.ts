import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { consumeJudgeRateLimit, __resetJudgeRateLimitForTests } from '../rateLimit';

describe('consumeJudgeRateLimit (in-memory fallback)', () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    __resetJudgeRateLimitForTests();
  });
  afterEach(() => {
    __resetJudgeRateLimitForTests();
  });

  it('allows the first call and reports the post-increment count', async () => {
    const d = await consumeJudgeRateLimit('alice', 5, '2026-06-04');
    expect(d.allowed).toBe(true);
    expect(d.count).toBe(1);
    expect(d.limit).toBe(5);
    expect(d.backend).toBe('memory');
  });

  it('rejects once the daily limit is exceeded', async () => {
    for (let i = 1; i <= 3; i++) {
      const d = await consumeJudgeRateLimit('bob', 3, '2026-06-04');
      expect(d.allowed).toBe(true);
      expect(d.count).toBe(i);
    }
    const over = await consumeJudgeRateLimit('bob', 3, '2026-06-04');
    expect(over.allowed).toBe(false);
    expect(over.count).toBe(4);
  });

  it('different YYYY-MM-DD keys are independent', async () => {
    const d1 = await consumeJudgeRateLimit('carol', 1, '2026-06-04');
    expect(d1.allowed).toBe(true);
    const d2 = await consumeJudgeRateLimit('carol', 1, '2026-06-04');
    expect(d2.allowed).toBe(false);
    const tomorrow = await consumeJudgeRateLimit('carol', 1, '2026-06-05');
    expect(tomorrow.allowed).toBe(true);
  });

  it('returns fail-open with limit <= 0 (defensive — never wedge the audit)', async () => {
    const d = await consumeJudgeRateLimit('dave', 0, '2026-06-04');
    expect(d.allowed).toBe(false);
    expect(d.backend).toBe('fail-open');
  });

  it('honours { memoryOnly: true } — never touches KV even when env says KV is configured (Codex Round 4 P2)', async () => {
    // The route passes memoryOnly:true when the rate-limit key embeds
    // a raw IP (IP_HASH_PEPPER unset). Even if KV is fully configured,
    // we must NOT write raw IPs to it — that would violate the same
    // contract `lib/audit/hashIp.ts` enforces. The flag forces the
    // in-memory branch unconditionally.
    process.env.KV_REST_API_URL = 'https://kv.example.com';
    process.env.KV_REST_API_TOKEN = 'pretend-token';
    __resetJudgeRateLimitForTests();
    const d = await consumeJudgeRateLimit('eve', 5, '2026-06-04', { memoryOnly: true });
    expect(d.allowed).toBe(true);
    expect(d.backend).toBe('memory');
    expect(d.count).toBe(1);
    // Increments still work within the memory bucket.
    const d2 = await consumeJudgeRateLimit('eve', 5, '2026-06-04', { memoryOnly: true });
    expect(d2.count).toBe(2);
    expect(d2.backend).toBe('memory');
  });
});
