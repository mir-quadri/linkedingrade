import { describe, expect, it } from 'vitest';

import {
  MAX_ABOUT_CHARS,
  MAX_HEADLINE_CHARS,
  parseJudgeRequestBody,
} from '../judgeRequestSchema';

describe('parseJudgeRequestBody', () => {
  it('rejects non-object payloads', () => {
    expect(parseJudgeRequestBody(null).ok).toBe(false);
    expect(parseJudgeRequestBody('x').ok).toBe(false);
    expect(parseJudgeRequestBody(42).ok).toBe(false);
  });

  it('rejects a missing judgeRequest', () => {
    expect(parseJudgeRequestBody({ auditId: 'a' }).ok).toBe(false);
  });

  it('rejects a judgeRequest with neither headline nor about', () => {
    expect(parseJudgeRequestBody({ judgeRequest: { rolesFamilyHint: 'eng' } }).ok).toBe(false);
  });

  it('accepts a headline-only request and carries auditId', () => {
    const res = parseJudgeRequestBody({
      auditId: 'aud_1',
      judgeRequest: { headline: { text: 'Engineer' } },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.request.headline?.text).toBe('Engineer');
      expect(res.value.auditId).toBe('aud_1');
    }
  });

  it('enforces the headline cap', () => {
    const ok = parseJudgeRequestBody({
      judgeRequest: { headline: { text: 'x'.repeat(MAX_HEADLINE_CHARS) } },
    });
    expect(ok.ok).toBe(true);
    const tooBig = parseJudgeRequestBody({
      judgeRequest: { headline: { text: 'x'.repeat(MAX_HEADLINE_CHARS + 1) } },
    });
    expect(tooBig.ok).toBe(false);
  });

  it('enforces the about cap', () => {
    const tooBig = parseJudgeRequestBody({
      judgeRequest: { about: { text: 'x'.repeat(MAX_ABOUT_CHARS + 1) } },
    });
    expect(tooBig.ok).toBe(false);
  });

  it('filters rewriteTargets to the allow-list and defaults auditId to null', () => {
    const res = parseJudgeRequestBody({
      judgeRequest: {
        about: { text: 'hi' },
        rewriteTargets: ['headline', 'about', 'bogus', 'currentExperience'],
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.request.rewriteTargets).toEqual(['headline', 'about', 'currentExperience']);
      expect(res.value.auditId).toBeNull();
    }
  });
});
