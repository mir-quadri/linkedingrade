import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAuditStore,
  __resetAuditStoreForTests,
  type AuditRecord,
  type SelfReport,
} from '../auditStore';

function fixtureRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    auditId: 'aud_test',
    createdAt: '2026-05-21T00:00:00Z',
    email: null,
    emailedAt: null,
    profile: {
      url: 'https://www.linkedin.com/in/example',
      extractedAt: '2026-05-21T00:00:00Z',
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
      generatedAt: '2026-05-21T00:00:00Z',
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
  };
}

const selfReportFixture: SelfReport = {
  photo: 'yes',
  banner: 'generic',
  activity: 'occasional',
  recommendations: '1-2',
  featured: 'no',
  submittedAt: '2026-05-21T00:05:00Z',
};

describe('auditStore (in-memory)', () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    __resetAuditStoreForTests();
  });
  afterEach(() => {
    __resetAuditStoreForTests();
  });

  it('saves and retrieves an audit record by id', async () => {
    const store = await getAuditStore();
    const record = fixtureRecord();
    await store.save(record);
    const fetched = await store.get('aud_test');
    expect(fetched).not.toBeNull();
    expect(fetched?.auditId).toBe('aud_test');
    expect(fetched?.email).toBeNull();
  });

  it('returns null for an unknown audit id', async () => {
    const store = await getAuditStore();
    expect(await store.get('nope')).toBeNull();
  });

  it('attachEmail updates the email and emailedAt timestamp', async () => {
    const store = await getAuditStore();
    await store.save(fixtureRecord());
    const updated = await store.attachEmail('aud_test', 'user@example.com', '2026-05-21T00:10:00Z', null, null);
    expect(updated?.email).toBe('user@example.com');
    expect(updated?.emailedAt).toBe('2026-05-21T00:10:00Z');
    const refetched = await store.get('aud_test');
    expect(refetched?.email).toBe('user@example.com');
  });

  // Codex P2 regression: user-agent and the hashed IP must be captured
  // at the email-submit step, not on initial upload. The privacy copy
  // ties their collection to the email step ("If you submit your
  // email, we also store …"). These tests pin that the store correctly
  // routes UA / IP through attachEmail and that an upload-only record
  // never carries them.
  it('save leaves userAgent and ipHash null — upload-only visitors carry no UA/IP metadata', async () => {
    const store = await getAuditStore();
    await store.save(fixtureRecord({ userAgent: null, ipHash: null }));
    const fetched = await store.get('aud_test');
    expect(fetched?.userAgent).toBeNull();
    expect(fetched?.ipHash).toBeNull();
  });

  it('attachEmail writes userAgent and ipHash captured at gate-submit time', async () => {
    const store = await getAuditStore();
    await store.save(fixtureRecord());
    const ua = 'Mozilla/5.0 (test)';
    const hash = 'a'.repeat(64);
    const updated = await store.attachEmail(
      'aud_test', 'user@example.com', '2026-05-21T00:10:00Z', ua, hash,
    );
    expect(updated?.userAgent).toBe(ua);
    expect(updated?.ipHash).toBe(hash);
    const refetched = await store.get('aud_test');
    expect(refetched?.userAgent).toBe(ua);
    expect(refetched?.ipHash).toBe(hash);
  });

  it('attachEmail returns null when the audit id does not exist', async () => {
    const store = await getAuditStore();
    const result = await store.attachEmail('missing', 'x@y.z', '2026-05-21T00:00:00Z', null, null);
    expect(result).toBeNull();
  });

  it('attachSelfReport persists self-report answers without touching audit score', async () => {
    const store = await getAuditStore();
    const original = fixtureRecord();
    await store.save(original);
    const updated = await store.attachSelfReport('aud_test', selfReportFixture);
    expect(updated?.selfReport).toEqual(selfReportFixture);
    // Critical invariant: composite score must not be mutated by the self-
    // report attach. The grade is an objective read of what we can verify;
    // self-assessed answers are supplementary metadata only.
    expect(updated?.audit.composite.score).toBe(original.audit.composite.score);
    expect(updated?.audit.composite.letter).toBe(original.audit.composite.letter);
  });

  it('subsequent attach calls preserve earlier attachments', async () => {
    const store = await getAuditStore();
    await store.save(fixtureRecord());
    await store.attachEmail('aud_test', 'user@example.com', '2026-05-21T00:10:00Z', null, null);
    const after = await store.attachSelfReport('aud_test', selfReportFixture);
    expect(after?.email).toBe('user@example.com');
    expect(after?.selfReport).toEqual(selfReportFixture);
  });

  // Codex P1 #3 regression: the auditId is returned to the browser before
  // the email step (the client needs it to POST /api/audit/email), so any
  // route that uses the id MUST check that record.email is set before
  // revealing the full report — otherwise the id alone is sufficient to
  // bypass the gate. The store doesn't gate reads itself (it's a dumb
  // K/V), but its `email` field is the canonical gate-cleared signal the
  // routes consult. These tests pin that signal: pre-gate records have
  // null email; attachEmail flips it; nothing else clears it.
  it('email field is null on freshly-saved records (gate-not-cleared signal)', async () => {
    const store = await getAuditStore();
    await store.save(fixtureRecord());
    const fetched = await store.get('aud_test');
    expect(fetched?.email).toBeNull();
    expect(fetched?.emailedAt).toBeNull();
  });

  it('attachSelfReport never clears the email field — the gate cannot regress', async () => {
    const store = await getAuditStore();
    await store.save(fixtureRecord());
    await store.attachEmail('aud_test', 'user@example.com', '2026-05-21T00:10:00Z', null, null);
    const after = await store.attachSelfReport('aud_test', selfReportFixture);
    expect(after?.email).toBe('user@example.com');
    expect(after?.emailedAt).toBe('2026-05-21T00:10:00Z');
  });

  // Codex P2 regression: the in-memory fallback ran without an expiry
  // path while the privacy copy promised 90 days. A long-lived
  // `next start` (self-hosted) instance would have retained PII
  // indefinitely. Lazy expiry on read + opportunistic prune on save
  // honour the same TTL the KV implementation enforces via `ex`.
  describe('90-day retention (Codex P2)', () => {
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('get returns null and prunes the entry once it crosses the 90-day TTL', async () => {
      const store = await getAuditStore();
      await store.save(fixtureRecord({ createdAt: '2026-01-01T00:00:00Z' }));
      // Day 89 — within window
      vi.setSystemTime(new Date(Date.parse('2026-01-01T00:00:00Z') + NINETY_DAYS_MS - 1));
      expect(await store.get('aud_test')).not.toBeNull();
      // Day 90 + 1ms — expired
      vi.setSystemTime(new Date(Date.parse('2026-01-01T00:00:00Z') + NINETY_DAYS_MS + 1));
      expect(await store.get('aud_test')).toBeNull();
      // Subsequent reads stay null (entry was pruned).
      expect(await store.get('aud_test')).toBeNull();
    });

    it('attachEmail refuses to write to a record past its 90-day TTL', async () => {
      const store = await getAuditStore();
      await store.save(fixtureRecord({ createdAt: '2026-01-01T00:00:00Z' }));
      vi.setSystemTime(new Date(Date.parse('2026-01-01T00:00:00Z') + NINETY_DAYS_MS + 1));
      const result = await store.attachEmail('aud_test', 'late@example.com', '2026-05-01T00:00:00Z', null, null);
      expect(result).toBeNull();
    });

    it('save opportunistically prunes other expired records in the map', async () => {
      const store = await getAuditStore();
      await store.save(fixtureRecord({ auditId: 'aud_old', createdAt: '2026-01-01T00:00:00Z' }));
      // Move clock past the TTL of the first record, then save a fresh one
      // — the save call should sweep `aud_old` out.
      vi.setSystemTime(new Date(Date.parse('2026-01-01T00:00:00Z') + NINETY_DAYS_MS + 1));
      await store.save(fixtureRecord({ auditId: 'aud_new', createdAt: new Date().toISOString() }));
      expect(await store.get('aud_old')).toBeNull();
      expect(await store.get('aud_new')).not.toBeNull();
    });

    it('records with a malformed createdAt are NOT silently expired', async () => {
      const store = await getAuditStore();
      // Pinning the conservative behaviour: if we can't parse the
      // timestamp, we prefer to keep the record (and let an operator
      // notice) rather than swallow data silently. The KV side has no
      // equivalent risk since it relies on Redis's server-side EX.
      await store.save(fixtureRecord({ createdAt: 'not-a-date' }));
      vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
      expect(await store.get('aud_test')).not.toBeNull();
    });
  });
});
