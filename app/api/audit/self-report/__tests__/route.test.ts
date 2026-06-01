import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST } from '../route';
import {
  getAuditStore,
  __resetAuditStoreForTests,
  type AuditRecord,
} from '@/lib/storage/auditStore';

const baseRecord = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  auditId: 'aud_test',
  createdAt: '2026-05-30T00:00:00Z',
  email: null,
  emailedAt: null,
  profile: {
    url: 'https://www.linkedin.com/in/example',
    extractedAt: '2026-05-30T00:00:00Z',
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
    generatedAt: '2026-05-30T00:00:00Z',
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

function post(body: unknown): Request {
  return new Request('http://localhost/api/audit/self-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/audit/self-report — gate behaviour', () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    __resetAuditStoreForTests();
  });
  afterEach(() => {
    __resetAuditStoreForTests();
  });

  it('returns 404 when no record exists for the audit id', async () => {
    const res = await POST(post({ auditId: 'nope', selfReport: { photo: 'yes' } }));
    expect(res.status).toBe(404);
  });

  it('returns 403 BEFORE the email gate has cleared — never accepts a write', async () => {
    const store = await getAuditStore();
    await store.save(baseRecord({ email: null }));
    const res = await POST(post({ auditId: 'aud_test', selfReport: { photo: 'yes' } }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/email/i);
    // The self-report must NOT have been written — otherwise an unauthenticated
    // caller could overwrite the user's saved answers via a known audit id.
    const after = await store.get('aud_test');
    expect(after?.selfReport).toBeNull();
  });

  it('accepts a write AFTER the email gate has cleared', async () => {
    const store = await getAuditStore();
    await store.save(baseRecord({ email: 'user@example.com', emailedAt: '2026-05-30T00:01:00Z' }));
    const res = await POST(
      post({
        auditId: 'aud_test',
        selfReport: {
          photo: 'yes',
          banner: 'generic',
          activity: 'occasional',
          recommendations: '1-2',
          featured: 'no',
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success?: boolean };
    expect(json.success).toBe(true);
    const after = await store.get('aud_test');
    expect(after?.selfReport?.photo).toBe('yes');
    expect(after?.selfReport?.featured).toBe('no');
  });

  it('returns 400 when the audit id is missing', async () => {
    const res = await POST(post({ selfReport: { photo: 'yes' } }));
    expect(res.status).toBe(400);
  });
});
