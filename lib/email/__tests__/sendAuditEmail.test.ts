import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendAuditEmail } from '../sendAuditEmail';
import type { AuditResult } from '@/lib/engine/types';

const audit: AuditResult = {
  url: 'https://www.linkedin.com/in/x',
  generatedAt: '2026-05-21T00:00:00Z',
  composite: { score: 73, letter: 'B', tier: 'T2', tierAssumed: false, percentileBand: null },
  sections: [],
  wins: [],
  fixes: [
    {
      sectionId: 'headline',
      label: 'Headline',
      currentLetter: 'C',
      targetLetter: 'B+',
      pointsGain: 6,
      effort: 'low',
      recommendation: 'Lead with a measurable outcome.',
    },
  ],
  heatMap: [],
  judgeStatus: 'ok',
  warnings: [],
};

describe('sendAuditEmail', () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });
  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    process.env.EMAIL_FROM = originalFrom;
  });

  it('returns false and does NOT call fetch when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = 'audit@linkedingrade.com';
    const ok = await sendAuditEmail({
      email: 'user@example.com',
      fullName: 'Jane Doe',
      audit,
      resultUrl: 'https://linkedingrade.com/audit/result/abc',
    });
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns false and does NOT call fetch when EMAIL_FROM is missing', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    delete process.env.EMAIL_FROM;
    const ok = await sendAuditEmail({
      email: 'user@example.com',
      fullName: null,
      audit,
      resultUrl: 'https://linkedingrade.com/audit/result/abc',
    });
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to the Resend API and returns true on success', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    process.env.EMAIL_FROM = 'audit@linkedingrade.com';
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'em_123' }), { status: 200 }));
    const ok = await sendAuditEmail({
      email: 'user@example.com',
      fullName: 'Jane Doe',
      audit,
      resultUrl: 'https://linkedingrade.com/audit/result/abc',
    });
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toContain('B');
    expect(body.html).toContain('Lead with a measurable outcome.');
    expect(body.text).toContain('Lead with a measurable outcome.');
  });

  it('returns false (fail-soft) when the Resend API responds non-2xx', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    process.env.EMAIL_FROM = 'audit@linkedingrade.com';
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"unauthorized"}', { status: 401 }));
    const ok = await sendAuditEmail({
      email: 'user@example.com',
      fullName: 'Jane Doe',
      audit,
      resultUrl: 'https://linkedingrade.com/audit/result/abc',
    });
    expect(ok).toBe(false);
  });

  it('returns false (fail-soft) when fetch itself rejects', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    process.env.EMAIL_FROM = 'audit@linkedingrade.com';
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const ok = await sendAuditEmail({
      email: 'user@example.com',
      fullName: 'Jane Doe',
      audit,
      resultUrl: 'https://linkedingrade.com/audit/result/abc',
    });
    expect(ok).toBe(false);
  });
});
