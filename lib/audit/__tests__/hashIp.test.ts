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

describe('extractIp', () => {
  it('prefers the first entry in x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' });
    expect(extractIp(headers)).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.5' });
    expect(extractIp(headers)).toBe('203.0.113.5');
  });

  it('returns null when neither header is present', () => {
    expect(extractIp(new Headers())).toBeNull();
  });
});
