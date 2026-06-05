import { describe, expect, it } from 'vitest';

import { pickGroundedRewriteTargets } from '../rewriteTargets';
import type { JudgeRequest } from '@/lib/engine/types/judge';

describe('pickGroundedRewriteTargets — only request rewrites for sections we actually sent source text for (Codex Round 3 P2)', () => {
  it('returns both when both Headline and About are in the request', () => {
    const req: JudgeRequest = {
      headline: { text: 'Senior Engineer @ Acme' },
      about: { text: 'Shipping platform software for fintech.' },
    };
    expect(pickGroundedRewriteTargets(req)).toEqual(['headline', 'about']);
  });

  it('returns ONLY headline when About is missing — does not ask for an ungrounded About rewrite', () => {
    const req: JudgeRequest = {
      headline: { text: 'Senior Engineer @ Acme' },
    };
    expect(pickGroundedRewriteTargets(req)).toEqual(['headline']);
  });

  it('returns ONLY about when Headline is missing — does not ask for an ungrounded Headline rewrite', () => {
    const req: JudgeRequest = {
      about: { text: 'Shipping platform software for fintech.' },
    };
    expect(pickGroundedRewriteTargets(req)).toEqual(['about']);
  });

  it('returns an empty array when neither section has source text — no rewrites requested', () => {
    const req: JudgeRequest = {};
    expect(pickGroundedRewriteTargets(req)).toEqual([]);
  });

  it('treats an empty-string `text` field as not present (defensive against upstream bugs)', () => {
    const req: JudgeRequest = {
      headline: { text: '' },
      about: { text: 'Real about text.' },
    };
    expect(pickGroundedRewriteTargets(req)).toEqual(['about']);
  });

  it('never includes currentExperience even if the request has it — 4-section MVP scope is Headline + About only', () => {
    const req: JudgeRequest = {
      headline: { text: 'Senior Engineer @ Acme' },
      about: { text: 'Shipping platform software.' },
      currentExperience: {
        title: 'Senior Engineer',
        company: 'Acme',
        description: 'Built things.',
      },
    };
    const targets = pickGroundedRewriteTargets(req);
    expect(targets).not.toContain('currentExperience');
    expect(targets).toEqual(['headline', 'about']);
  });
});
