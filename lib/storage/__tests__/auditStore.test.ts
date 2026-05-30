import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
    const updated = await store.attachEmail('aud_test', 'user@example.com', '2026-05-21T00:10:00Z');
    expect(updated?.email).toBe('user@example.com');
    expect(updated?.emailedAt).toBe('2026-05-21T00:10:00Z');
    const refetched = await store.get('aud_test');
    expect(refetched?.email).toBe('user@example.com');
  });

  it('attachEmail returns null when the audit id does not exist', async () => {
    const store = await getAuditStore();
    const result = await store.attachEmail('missing', 'x@y.z', '2026-05-21T00:00:00Z');
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
    await store.attachEmail('aud_test', 'user@example.com', '2026-05-21T00:10:00Z');
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
    await store.attachEmail('aud_test', 'user@example.com', '2026-05-21T00:10:00Z');
    const after = await store.attachSelfReport('aud_test', selfReportFixture);
    expect(after?.email).toBe('user@example.com');
    expect(after?.emailedAt).toBe('2026-05-21T00:10:00Z');
  });
});
