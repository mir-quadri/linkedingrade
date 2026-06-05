import { describe, expect, it } from 'vitest';

import { runScoring } from '@/lib/engine/scoring';
import { scoreHeadline } from '@/lib/engine/scoring/sections/headline';
import { scoreAbout } from '@/lib/engine/scoring/sections/about';
import { B_PLUS_CEILING } from '@/lib/engine/scoring/letters';
import type { JudgeResponse, HeadlineJudgment, AboutJudgment } from '@/lib/engine/types/judge';
import { makeProfile, entry } from './fixtures';

/**
 * B3 Unit 2 — lift-only invariant.
 *
 * The AI judge may RAISE a needsReview section above the B+ structural
 * ceiling (toward A) when the judgment confirms the structural cues are
 * real, but it must NEVER drop a section below its structural floor.
 * These tests pin both halves of the contract.
 */

const STRONG_HEADLINE_JUDGMENT: HeadlineJudgment = {
  hasCliche: false,
  hasIdentity: true,
  hasDomain: true,
  hasCredibleSpecific: true,
  mobileSafe: true,
  notes: 'Specific identity + domain + credible specific within mobile cut.',
};

const HARSH_HEADLINE_JUDGMENT: HeadlineJudgment = {
  hasCliche: true,
  hasIdentity: false,
  hasDomain: false,
  hasCredibleSpecific: false,
  mobileSafe: false,
  notes: 'Reads as buzzword soup.',
};

const STRONG_ABOUT_JUDGMENT: AboutJudgment = {
  hasHook: true,
  hasRange: true,
  hasCTA: true,
  voiceIsHuman: true,
  buzzwordDensity: 'low',
  notes: 'Specific hook; clear arc; explicit CTA; human voice.',
};

const HARSH_ABOUT_JUDGMENT: AboutJudgment = {
  hasHook: false,
  hasRange: false,
  hasCTA: false,
  voiceIsHuman: false,
  buzzwordDensity: 'high',
  notes: 'Machine-generated phrasing throughout.',
};

const STRONG_HEADLINE_TEXT =
  'Senior Director, Data Science | Building Enterprise AI Platforms | Driving Analytics Strategy | ML & Risk Transformation Leader';

const STRONG_ABOUT_TEXT =
  'I ship developer-platform software for regulated fintech. Eight years on the same problem. ' +
  'Range across infra, billing, and compliance integrations. Currently building observability for ' +
  'payment rails at a Series B. Open to staff / principal roles where the team owns the platform end-to-end.';

describe('B3 — judge LIFT above the B+ structural ceiling', () => {
  it('lifts a structurally-strong headline above the B+ cap when the judge confirms identity/domain/specific', () => {
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
    });

    // Structural only — should sit at the B+ ceiling.
    const structural = scoreHeadline(profile, undefined);
    expect(structural.needsReview).toBe(true);
    expect(structural.rawScore).toBeLessThanOrEqual(B_PLUS_CEILING);

    // With a confirming judge — lifts above the B+ structural cap.
    const lifted = scoreHeadline(profile, STRONG_HEADLINE_JUDGMENT);
    expect(lifted.needsReview).toBe(false);
    expect(lifted.rawScore).toBeGreaterThan(B_PLUS_CEILING);
  });

  it('lifts a structurally-strong About section when the judge confirms hook/range/CTA/voice', () => {
    const profile = makeProfile({
      about: { data: STRONG_ABOUT_TEXT, confidence: 'high' },
    });

    const structural = scoreAbout(profile, undefined);
    expect(structural.needsReview).toBe(true);
    const lifted = scoreAbout(profile, STRONG_ABOUT_JUDGMENT);
    expect(lifted.needsReview).toBe(false);
    expect(lifted.rawScore).toBeGreaterThan(structural.rawScore);
  });
});

describe('B3 — structural FLOOR holds (judge never drops a section below structural)', () => {
  it('a harsh judgment on a structurally-decent headline cannot drop the score below its structural floor', () => {
    // Pick a headline whose STRUCTURAL grade is mid-range (not floor-of-zero)
    // so there's room for a harsh judge to try to drop it.
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
    });

    const structural = scoreHeadline(profile, undefined);
    const harshed = scoreHeadline(profile, HARSH_HEADLINE_JUDGMENT);

    // The judge applied judgmental signals (needsReview clears because
    // four flags came back), but the rawScore must NOT be lower than the
    // structural-only score.
    expect(harshed.needsReview).toBe(false);
    expect(harshed.rawScore).toBeGreaterThanOrEqual(structural.rawScore);
  });

  it('a harsh judgment on a structurally-decent About cannot drop below its structural floor', () => {
    const profile = makeProfile({
      about: { data: STRONG_ABOUT_TEXT, confidence: 'high' },
    });

    const structural = scoreAbout(profile, undefined);
    const harshed = scoreAbout(profile, HARSH_ABOUT_JUDGMENT);

    expect(harshed.needsReview).toBe(false);
    expect(harshed.rawScore).toBeGreaterThanOrEqual(structural.rawScore);
  });

  it('a weak structural headline + harsh judgment still holds the (low) structural floor', () => {
    // Mir's D-tier headline equivalent: bare title, no pipes, no specifics.
    const profile = makeProfile({
      headline: { data: 'Software Engineer', confidence: 'high' },
    });
    const structural = scoreHeadline(profile, undefined);
    const harshed = scoreHeadline(profile, HARSH_HEADLINE_JUDGMENT);
    // Even at the bottom, the judge can't push it lower.
    expect(harshed.rawScore).toBeGreaterThanOrEqual(structural.rawScore);
  });
});

describe('B3 — needsReview clears ONLY when the judge actually returned for that section', () => {
  it('headline keeps needsReview when no judge response is supplied', () => {
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
    });
    const audit = runScoring(profile, {}, 'pdf');
    const headline = audit.sections.find((s) => s.id === 'headline')!;
    expect(headline.needsReview).toBe(true);
    expect(headline.adjustedScore).toBeLessThanOrEqual(B_PLUS_CEILING);
  });

  it('headline lifts and clears needsReview when judge response is supplied', () => {
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
    });
    const judgeResponse: JudgeResponse = { headline: STRONG_HEADLINE_JUDGMENT };
    const audit = runScoring(profile, judgeResponse, 'pdf');
    const headline = audit.sections.find((s) => s.id === 'headline')!;
    expect(headline.needsReview).toBe(false);
    // No longer capped at B+ — the judge lifted it.
    expect(headline.adjustedScore).toBeGreaterThan(B_PLUS_CEILING);
  });

  it('a judge response covering headline but not about clears needsReview only on headline', () => {
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
      about: { data: STRONG_ABOUT_TEXT, confidence: 'high' },
    });
    const judgeResponse: JudgeResponse = { headline: STRONG_HEADLINE_JUDGMENT };
    const audit = runScoring(profile, judgeResponse, 'pdf');
    const headline = audit.sections.find((s) => s.id === 'headline')!;
    const about = audit.sections.find((s) => s.id === 'about')!;
    expect(headline.needsReview).toBe(false);
    expect(about.needsReview).toBe(true);
    expect(about.adjustedScore).toBeLessThanOrEqual(B_PLUS_CEILING);
  });
});

describe('B3 — judgeStatus is honest about PDF MVP scope', () => {
  it("reports judgeStatus 'ok' when the proxy returns Headline + About + buzzwords (the full PDF MVP set)", () => {
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
      about: { data: STRONG_ABOUT_TEXT, confidence: 'high' },
    });
    const judgeResponse: JudgeResponse = {
      headline: STRONG_HEADLINE_JUDGMENT,
      about: STRONG_ABOUT_JUDGMENT,
      buzzwords: { density: 'low', examples: [], notes: 'Clean across both sections.' },
    };
    const audit = runScoring(profile, judgeResponse, 'pdf');
    // PDF mode does NOT expect currentExperience/keywords/photo/banner
    // judgments — the proxy doesn't return them in this MVP.
    // judgeStatus must be `ok`, not `partial`.
    expect(audit.judgeStatus).toBe('ok');
    expect(audit.warnings).toEqual([]);
  });

  it("reports judgeStatus 'unavailable' when the proxy returned nothing at all", () => {
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
      about: { data: STRONG_ABOUT_TEXT, confidence: 'high' },
    });
    const audit = runScoring(profile, {}, 'pdf');
    expect(audit.judgeStatus).toBe('unavailable');
  });

  it("reports judgeStatus 'partial' when the proxy returned Headline + About but not buzzwords", () => {
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
      about: { data: STRONG_ABOUT_TEXT, confidence: 'high' },
    });
    const judgeResponse: JudgeResponse = {
      headline: STRONG_HEADLINE_JUDGMENT,
      about: STRONG_ABOUT_JUDGMENT,
      // buzzwords absent — proxy dropped it
    };
    const audit = runScoring(profile, judgeResponse, 'pdf');
    expect(audit.judgeStatus).toBe('partial');
  });
});

describe('B3 — composite differentiation preserved under judge lift', () => {
  it('a strong + judged profile composites HIGHER than the same profile scored structurally-only', () => {
    // Mirror the John profile shape — strong headline + strong About.
    // With judge: should lift above structural-only composite.
    const profile = makeProfile({
      headline: { data: STRONG_HEADLINE_TEXT, confidence: 'high' },
      about: { data: STRONG_ABOUT_TEXT, confidence: 'high' },
      currentExperience: {
        data: entry({
          title: 'Senior Director of Data Science',
          company: 'Acme',
          description: 'Reduced model inference latency 42% across 11 product surfaces in 3 quarters.',
        }),
        confidence: 'high',
      },
      experienceHistory: {
        data: [entry({ title: 'Senior Director of Data Science' }), entry({ title: 'Director, Data Science' }), entry({ title: 'Lead Engineer' })],
        confidence: 'high',
      },
    });
    const structuralOnly = runScoring(profile, {}, 'pdf');
    const judged = runScoring(
      profile,
      { headline: STRONG_HEADLINE_JUDGMENT, about: STRONG_ABOUT_JUDGMENT },
      'pdf',
    );
    expect(judged.composite.score).toBeGreaterThan(
      structuralOnly.composite.score,
    );
  });

  it("a weak structural + harsh judgment composites AT LEAST as high as structural-only — never lower", () => {
    // The Mir D shape: bare headline, missing About.
    const profile = makeProfile({
      headline: { data: 'Software Engineer', confidence: 'high' },
      currentExperience: {
        data: entry({ title: 'Software Engineer', description: 'Worked on features.' }),
        confidence: 'high',
      },
      experienceHistory: {
        data: [entry({ title: 'Software Engineer' })],
        confidence: 'high',
      },
    });
    const structuralOnly = runScoring(profile, {}, 'pdf');
    const judged = runScoring(
      profile,
      { headline: HARSH_HEADLINE_JUDGMENT },
      'pdf',
    );
    // The harsh judgment cleared needsReview on headline (so the B+ cap
    // no longer applies) AND held the structural floor — net effect on
    // composite must not be a decrease vs. structural-only.
    expect(judged.composite.score).toBeGreaterThanOrEqual(
      structuralOnly.composite.score,
    );
  });
});
