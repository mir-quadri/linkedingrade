import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KvAuditStore, type AuditRecord, type SelfReport } from '../auditStore';

interface SetCall {
  key: string;
  value: string;
  opts?: { ex?: number; nx?: boolean };
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
    async set(
      key: string,
      value: string,
      opts?: { ex?: number; nx?: boolean },
    ): Promise<string | null> {
      // Honour NX so the email-gate claim test exercises the real
      // path: existing key + nx === null return without mutation.
      if (opts?.nx && map.has(key)) {
        calls.push({ key, value, opts });
        return null;
      }
      calls.push({ key, value, opts });
      map.set(key, value);
      return 'OK';
    },
    async get<T = unknown>(key: string): Promise<T | null> {
      const v = map.get(key);
      return (v ?? null) as T | null;
    },
    async del(key: string): Promise<number> {
      const had = map.delete(key);
      return had ? 1 : 0;
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
    const updated = await store.attachEmail('aud_kv', 'late@example.com', new Date().toISOString(), null, null);
    expect(updated?.email).toBe('late@example.com');
    // Three set calls now: initial save (no NX), claim (NX), record write.
    expect(calls).toHaveLength(3);
    // The remaining TTL at day 89 must be ~1 day (86400 ± a second of
    // jitter from Math.ceil), NOT a fresh 90 days. The pre-fix bug
    // re-set this to RECORD_TTL_SECONDS, extending retention by ~89
    // days past the original window.
    const recordWrite = calls.find((c) => c.key === 'audit:aud_kv' && !c.opts?.nx && c.opts?.ex !== NINETY_DAYS_S);
    expect(recordWrite).toBeDefined();
    const ex = recordWrite!.opts?.ex ?? 0;
    expect(ex).toBeGreaterThan(86_390);
    expect(ex).toBeLessThanOrEqual(86_400);
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
    const result = await store.attachEmail('aud_kv', 'too-late@example.com', new Date().toISOString(), null, null);
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

  // Codex P2 regression: the email-gate guard was a non-atomic
  // read-then-write — two concurrent /api/audit/email requests could
  // both observe `email: null`, both pass the check, both persist /
  // send. The SET NX claim makes the gate atomic at the Redis level.
  it('attachEmail loses race when the claim key already exists — no record write, no Resend payload', async () => {
    const createdAt = '2026-01-01T00:00:00Z';
    vi.setSystemTime(new Date(createdAt));
    const { client, calls } = fakeKv();
    const store = new KvAuditStore(client);
    await store.save(baseRecord({ createdAt }));

    // Simulate the concurrent winner: pre-set the claim key.
    await client.set('audit:aud_kv:claim', 'winner@example.com', { ex: 86_400, nx: true });
    const callsBefore = calls.length;

    const result = await store.attachEmail(
      'aud_kv', 'loser@example.com', new Date().toISOString(), 'ua', 'hash',
    );
    expect(result).toBeNull();
    // The losing caller attempted ONE more set — the NX claim, which
    // failed — and bailed without touching the main record.
    expect(calls.length).toBe(callsBefore + 1);
    const last = calls[calls.length - 1]!;
    expect(last.opts?.nx).toBe(true);
    expect(last.key).toBe('audit:aud_kv:claim');

    // The stored record's email is still null — the claim alone never
    // mutates the main record, so the losing caller can't leave a
    // partial state behind.
    const stored = await store.get('aud_kv');
    expect(stored?.email).toBeNull();
  });

  it('releases the claim if the main-record write throws — retry can succeed', async () => {
    const createdAt = '2026-01-01T00:00:00Z';
    vi.setSystemTime(new Date(createdAt));
    const { client } = fakeKv();
    const store = new KvAuditStore(client);
    await store.save(baseRecord({ createdAt }));

    // Inject a failure on the record write — the claim write is fine,
    // but the subsequent main-record set throws. Without the
    // cleanup in attachEmail, the claim would remain set and the
    // audit would be permanently un-emailable. setCalls counts only
    // sets that go through the patched function (the initial save
    // above ran with the original).
    const originalSet = client.set;
    let setCalls = 0;
    client.set = async (key: string, value: string, opts?: { ex?: number; nx?: boolean }) => {
      setCalls += 1;
      // Call 1 inside attachEmail is the claim (succeeds via original).
      // Call 2 is the main-record write — throw here.
      if (setCalls === 2) throw new Error('kv write failed');
      return originalSet(key, value, opts);
    };

    await expect(
      store.attachEmail('aud_kv', 'user@example.com', new Date().toISOString(), null, null),
    ).rejects.toThrow('kv write failed');

    // Restore the spy so we can probe the resulting state and try again.
    client.set = originalSet;
    // The claim must have been released.
    expect(await client.get('audit:aud_kv:claim')).toBeNull();
    // A retry now succeeds, proving the audit isn't permanently stuck.
    const retry = await store.attachEmail('aud_kv', 'user@example.com', new Date().toISOString(), null, null);
    expect(retry?.email).toBe('user@example.com');
  });
});
