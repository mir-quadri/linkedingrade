import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractIp, hashIp } from '../hashIp';

describe('hashIp', () => {
  const originalPepper = process.env.IP_HASH_PEPPER;
  beforeEach(() => {
    delete process.env.IP_HASH_PEPPER;
  });
  afterEach(() => {
    if (originalPepper === undefined) {
      delete process.env.IP_HASH_PEPPER;
    } else {
      process.env.IP_HASH_PEPPER = originalPepper;
    }
  });

  it('returns null when the pepper is missing — refuses to hash a tiny keyspace without it', () => {
    expect(hashIp('203.0.113.1')).toBeNull();
  });

  it('returns null for null / undefined / empty ips even with a pepper set', () => {
    process.env.IP_HASH_PEPPER = 'pepper';
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp('')).toBeNull();
  });

  it('produces a stable 64-char hex digest for the same ip and pepper', () => {
    process.env.IP_HASH_PEPPER = 'pepper';
    const a = hashIp('203.0.113.1');
    const b = hashIp('203.0.113.1');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different digests for different IPs', () => {
    process.env.IP_HASH_PEPPER = 'pepper';
    expect(hashIp('203.0.113.1')).not.toBe(hashIp('203.0.113.2'));
  });

  it('produces different digests for the same IP under a different pepper', () => {
    process.env.IP_HASH_PEPPER = 'pepperA';
    const a = hashIp('203.0.113.1');
    process.env.IP_HASH_PEPPER = 'pepperB';
    const b = hashIp('203.0.113.1');
    expect(a).not.toBe(b);
  });
});

describe('extractIp — trust chain (Vercel-stamped headers only)', () => {
  it('prefers x-vercel-forwarded-for chain[0] (Vercel-trusted)', () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '203.0.113.1, 10.0.0.1',
    });
    expect(extractIp(headers)).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip when x-vercel-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.5' });
    expect(extractIp(headers)).toBe('203.0.113.5');
  });

  it('returns null when neither Vercel-trusted header is present', () => {
    expect(extractIp(new Headers())).toBeNull();
  });

  it("does NOT read x-forwarded-for — chain[0] is client-controlled on Vercel and unreliable elsewhere", () => {
    // An authenticated caller with the proxy secret (curl, the future
    // browser extension, a misconfigured local proxy) can supply any
    // value for x-forwarded-for. Trusting it would let them fan out
    // across the per-IP rate-limit buckets and exhaust the documented
    // per-IP cap arbitrarily.
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.1, 203.0.113.1',
    });
    expect(extractIp(headers)).toBeNull();
  });

  it("Vercel-trusted x-vercel-forwarded-for wins over a tampered x-forwarded-for", () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '203.0.113.1',
      'x-forwarded-for': '198.51.100.99',
    });
    expect(extractIp(headers)).toBe('203.0.113.1');
  });
});
