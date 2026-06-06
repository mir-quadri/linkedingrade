import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveJudgeRateKey } from '../ipRateKey';

function headers(h: Record<string, string>): Headers {
  return new Headers(h);
}

describe('deriveJudgeRateKey', () => {
  beforeEach(() => {
    delete process.env.IP_HASH_PEPPER;
  });
  afterEach(() => {
    delete process.env.IP_HASH_PEPPER;
  });

  it('hashes the IP and persists (memoryOnly=false) when the pepper is set', () => {
    process.env.IP_HASH_PEPPER = 'pep';
    const k = deriveJudgeRateKey(headers({ 'x-real-ip': '1.2.3.4' }), 'judge');
    expect(k.keyShape).toBe('hash');
    expect(k.memoryOnly).toBe(false);
    expect(k.rateLimitKey.startsWith('judge:hash:')).toBe(true);
    // The raw IP must not appear in the key.
    expect(k.rateLimitKey).not.toContain('1.2.3.4');
  });

  it('falls back to a raw-IP key in memory-only mode when the pepper is unset', () => {
    const k = deriveJudgeRateKey(headers({ 'x-real-ip': '1.2.3.4' }), 'ext-judge');
    expect(k.keyShape).toBe('raw');
    expect(k.memoryOnly).toBe(true);
    expect(k.rateLimitKey).toBe('ext-judge:raw:1.2.3.4');
  });

  it('uses a no-ip partition (memory-only) when there is no client IP', () => {
    const k = deriveJudgeRateKey(headers({}), 'ext-judge');
    expect(k.keyShape).toBe('no-ip');
    expect(k.memoryOnly).toBe(true);
    expect(k.rateLimitKey).toBe('ext-judge:no-ip');
  });

  it('keeps endpoints in separate buckets via the prefix', () => {
    const a = deriveJudgeRateKey(headers({ 'x-real-ip': '9.9.9.9' }), 'judge');
    const b = deriveJudgeRateKey(headers({ 'x-real-ip': '9.9.9.9' }), 'ext-judge');
    expect(a.rateLimitKey).not.toBe(b.rateLimitKey);
  });
});
