import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KvAuditStore, type AuditRecord, type SelfReport } from '../auditStore';

interface SetCall {
  key: string;
  value: string;
  opts?: { ex?: number };
}

/**
 * Bare-bones KvClient stand-in: stores the most recent set per key in a
 * Map and records each set's `ex` so we can assert the TTL contract
 * directly. We don't simulate Redis-side expiry — the point of these
 * tests is that the values we pass to `ex` are correct, not that
 * Upstash honours them.
 */
function fakeKv() {
  const map = new Map<string, string>();
  const calls: SetCall[] = [];
  const client = {
    async set(key: string, value: string, opts?: { ex?: number }) {
      calls.push({ key, value, opts });
      map.set(key, value);
    },
    async get<T = unknown>(key: string): Promise<T | null> {
      const v = map.get(key);
      return (v ?? null) as T | null;
    },
  };
  return { client, calls };
}

const baseRecord = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  auditId: 'aud_kv',
  createdAt: '2026-01-01T00:00:00Z',
  email: null,
  emailedAt: null,
  profile: {
    url: 'https://www.linkedin.com/in/example',
    extractedAt: '2026-01-01T00:00:00Z',
    fullName: 'Test User',
    headline: { data: null, confidence: 'missing' },
    photo: { data: null, confidence: 'missing' },
    banner: { data: null, confidence: 'missing' },
    about: { data: null, confidence: 'missing' },
    currentExperience: { data: null, confidence: 'missing' },
    experienceHistory: { data: null, confidence: 'missing' },
    skills: { data: null, confidence: 'missing' },
    featured: { data: null, confidence: 'missing' },
    activity: { data: null, confidence: 'missing' },
    recommendations: { data: null, confidence: 'missing' },
    education: { data: null, confidence: 'missing' },
    certifications: { data: null, confidence: 'missing' },
  },
  audit: {
    url: 'https://www.linkedin.com/in/example',
    generatedAt: '2026-01-01T00:00:00Z',
    composite: { score: 50, letter: 'C', tier: 'T2', tierAssumed: true, percentileBand: null },
    sections: [],
    wins: [],
    fixes: [],
    heatMap: [],
    judgeStatus: 'unavailable',
    warnings: [],
  },
  selfReport: null,
  userAgent: null,
  ipHash: null,
  ...overrides,
});

const selfReport: SelfReport = {
  photo: 'yes',
  banner: 'generic',
  activity: 'occasional',
  recommendations: '1-2',
  featured: 'no',
  submittedAt: '2026-04-01T00:00:00Z',
};

const NINETY_DAYS_S = 90 * 24 * 60 * 60;
const NINETY_DAYS_MS = NINETY_DAYS_S * 1000;

describe('KvAuditStore — retention anchored to createdAt (Codex P2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial save uses the full 90-day EX', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { client, calls } = fakeKv();
    const store = new KvAuditStore(client);
    await store.save(baseRecord());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.opts?.ex).toBe(NINETY_DAYS_S);
  });

  it('attachEmail near end of window keeps the EX anchored to createdAt — does NOT reset to 90 days', async () => {
    const createdAt = '2026-01-01T00:00:00Z';
    vi.setSystemTime(new Date(createdAt));
    const { client, calls } = fakeKv();
    const store = new KvAuditStore(client);
    await store.save(baseRecord({ createdAt }));

    // Submit email at day 89.
    vi.setSystemTime(new Date(Date.parse(createdAt) + NINETY_DAYS_MS - 24 * 60 * 60 * 1000));
    const updated = await store.attachEmail('aud_kv', 'late@example.com', new Date().toISOString());
    expect(updated?.email).toBe('late@example.com');
    expect(calls).toHaveLength(2);
    // The remaining TTL at day 89 must be ~1 day (86400 ± a second of
    // jitter from Math.ceil), NOT a fresh 90 days. The pre-fix bug
    // re-set this to RECORD_TTL_SECONDS, extending retention by ~89
    // days past the original window.
    const ex = calls[1]!.opts?.ex ?? 0;
    expect(ex).toBeGreaterThan(86_390);
    expect(ex).toBeLessThanOrEqual(86_400);
    // Sanity: definitely not the full TTL.
    expect(ex).toBeLessThan(NINETY_DAYS_S);
  });

  it('attachSelfReport applies the same createdAt-anchored EX as attachEmail', async () => {
    const createdAt = '2026-01-01T00:00:00Z';
    vi.setSystemTime(new Date(createdAt));
    const { client, calls } = fakeKv();
    const store = new KvAuditStore(client);
    await store.save(baseRecord({ createdAt, email: 'user@example.com' }));
    vi.setSystemTime(new Date(Date.parse(createdAt) + 30 * 24 * 60 * 60 * 1000)); // day 30
    await store.attachSelfReport('aud_kv', selfReport);
    expect(calls).toHaveLength(2);
    const ex = calls[1]!.opts?.ex ?? 0;
    const expected = 60 * 24 * 60 * 60; // 60 days remaining
    expect(ex).toBeGreaterThan(expected - 5);
    expect(ex).toBeLessThanOrEqual(expected);
  });

  it('attachEmail past 90 days refuses to write — returns null without calling set', async () => {
    const createdAt = '2026-01-01T00:00:00Z';
    vi.setSystemTime(new Date(createdAt));
    const { client, calls } = fakeKv();
    const store = new KvAuditStore(client);
    await store.save(baseRecord({ createdAt }));
    // Past TTL
    vi.setSystemTime(new Date(Date.parse(createdAt) + NINETY_DAYS_MS + 1));
    const result = await store.attachEmail('aud_kv', 'too-late@example.com', new Date().toISOString());
    expect(result).toBeNull();
    // Only the original save call — no second `set` from the rejected
    // attach. This is the meaningful guard: if the rejected write still
    // sent a `set` with a fresh EX, the record's retention would extend.
    expect(calls).toHaveLength(1);
  });

  it('attachSelfReport past 90 days refuses to write — returns null without calling set', async () => {
    const createdAt = '2026-01-01T00:00:00Z';
    vi.setSystemTime(new Date(createdAt));
    const { client, calls } = fakeKv();
    const store = new KvAuditStore(client);
    await store.save(baseRecord({ createdAt }));
    vi.setSystemTime(new Date(Date.parse(createdAt) + NINETY_DAYS_MS + 1));
    const result = await store.attachSelfReport('aud_kv', selfReport);
    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
