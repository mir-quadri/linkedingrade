import { afterEach, describe, expect, it } from 'vitest';

import { RATE_LIMIT_PER_DAY } from '../config';
import { __resetRateLimiterForTests, bucketKey, getRateLimiter } from '../rateLimit';

afterEach(() => {
  __resetRateLimiterForTests();
});

describe('judge rate limiter (in-memory)', () => {
  it('allows up to the daily cap, then blocks', async () => {
    const limiter = await getRateLimiter();
    for (let i = 1; i <= RATE_LIMIT_PER_DAY; i++) {
      const r = await limiter.hit('ip-a');
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i);
      expect(r.limit).toBe(RATE_LIMIT_PER_DAY);
    }
    const overflow = await limiter.hit('ip-a');
    expect(overflow.allowed).toBe(false);
    expect(overflow.count).toBe(RATE_LIMIT_PER_DAY + 1);
  });

  it('counts each IP independently', async () => {
    const limiter = await getRateLimiter();
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) await limiter.hit('ip-a');
    // ip-a is now exhausted; ip-b is untouched.
    expect((await limiter.hit('ip-a')).allowed).toBe(false);
    expect((await limiter.hit('ip-b')).allowed).toBe(true);
  });

  it('buckets keys by UTC day', () => {
    const ts = Date.parse('2026-06-04T23:59:00Z');
    expect(bucketKey('ip-a', ts)).toBe('judge:rl:ip-a:2026-06-04');
    const nextDay = Date.parse('2026-06-05T00:01:00Z');
    expect(bucketKey('ip-a', nextDay)).toBe('judge:rl:ip-a:2026-06-05');
  });
});
