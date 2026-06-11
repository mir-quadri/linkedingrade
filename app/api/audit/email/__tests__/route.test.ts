import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';
import {
  getAuditStore,
  __resetAuditStoreForTests,
  type AuditRecord,
} from '@/lib/storage/auditStore';

const baseRecord = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  auditId: 'aud_test',
  createdAt: new Date().toISOString(),
  email: null,
  emailedAt: null,
  profile: {
    url: 'https://www.linkedin.com/in/example',
    extractedAt: new Date().toISOString(),
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
    generatedAt: new Date().toISOString(),
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
  return new Request('http://localhost/api/audit/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Codex P2 regression: once a record has been gated, this endpoint must
 * reject any subsequent attach attempt. Without that, anyone with the
 * permanent /audit/result/<auditId> URL could POST here with that id,
 * replace the stored email + UA + IP hash, and trigger a fresh Resend
 * send to themselves — effectively a "send this audit to any address"
 * capability for whoever sees the link.
 */
describe('POST /api/audit/email — already-gated record is immutable (Codex P2)', () => {
  // sendAuditEmail is missing the env vars in the test, so it returns
  // false without calling fetch. We also spy on fetch as belt-and-braces
  // so a refused 409 attempt provably never reaches Resend.
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.BREVO_API_KEY;
    delete process.env.EMAIL_FROM;
    __resetAuditStoreForTests();
    fetchSpy.mockReset();
  });
  afterEach(() => {
    __resetAuditStoreForTests();
  });

  it('first submit succeeds and stores the email', async () => {
    const store = await getAuditStore();
    await store.save(baseRecord());
    const res = await POST(post({ auditId: 'aud_test', email: 'first@example.com' }));
    expect(res.status).toBe(200);
    const after = await store.get('aud_test');
    expect(after?.email).toBe('first@example.com');
  });

  it('second submit returns 409 with no store write and no Resend send', async () => {
    const store = await getAuditStore();
    await store.save(
      baseRecord({
        email: 'first@example.com',
        emailedAt: '2026-05-21T00:00:00Z',
        userAgent: 'ua-first',
        ipHash: 'hash-first',
      }),
    );
    const res = await POST(post({ auditId: 'aud_test', email: 'attacker@example.com' }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/already/i);
    // Stored record is untouched — attacker can't re-target the audit.
    const after = await store.get('aud_test');
    expect(after?.email).toBe('first@example.com');
    expect(after?.userAgent).toBe('ua-first');
    expect(after?.ipHash).toBe('hash-first');
    // Resend was never invoked. (sendAuditEmail returns false without
    // env vars too, but this is the meaningful guard: if a fetch did
    // reach Resend on a refused write, the gate would be cosmetic.)
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submit against an unknown audit id returns 404', async () => {
    const res = await POST(post({ auditId: 'nope', email: 'user@example.com' }));
    expect(res.status).toBe(404);
  });

  it('submit with an invalid email returns 400 — never reaches the store', async () => {
    const store = await getAuditStore();
    await store.save(baseRecord());
    const res = await POST(post({ auditId: 'aud_test', email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const after = await store.get('aud_test');
    expect(after?.email).toBeNull();
  });
});
