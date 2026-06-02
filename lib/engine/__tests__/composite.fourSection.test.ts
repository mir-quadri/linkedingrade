import { describe, expect, it } from 'vitest';

import { runScoring, runPdfAudit, PDF_AUDIT_SECTIONS, PDF_AUDIT_SECTION_IDS, PDF_NON_GRADED_SECTION_IDS } from '@/lib/engine/scoring';
import { computeComposite } from '@/lib/engine/scoring/composite';
import { scoreToNextLetterThreshold } from '@/lib/engine/scoring/letters';
import type { SectionId, SectionScore } from '@/lib/engine/types';
import { CAPTURED_PROFILES, makeProfile, entry } from './fixtures';

describe('PDF composite scope — 4 graded sections only', () => {
  it('still returns all 12 sections on the audit object', () => {
    const { audit } = runPdfAudit(CAPTURED_PROFILES.John);
    expect(audit.sections).toHaveLength(12);
    expect(audit.sections.filter((s) => PDF_NON_GRADED_SECTION_IDS.includes(s.id))).toHaveLength(8);
  });

  it('computes the composite as the equal-weighted mean of the 4 graded sections', () => {
    const { audit } = runPdfAudit(CAPTURED_PROFILES.John);
    const graded = audit.sections.filter((s) => PDF_AUDIT_SECTION_IDS.includes(s.id));
    expect(graded).toHaveLength(4);
    const mean = graded.reduce((acc, s) => acc + s.adjustedScore, 0) / graded.length;
    expect(audit.composite.score).toBeCloseTo(Math.round(mean * 10) / 10, 5);
  });

  it('produces a different composite than the full 12-section audit', () => {
    const pdf = runScoring(CAPTURED_PROFILES.John, {}, 'pdf');
    const full = runScoring(CAPTURED_PROFILES.John, {}, 'full');
    // The 8 non-graded sections (photo/banner/etc) drag the full composite
    // down; the focused composite ignores them.
    expect(pdf.composite.score).not.toBe(full.composite.score);
  });

  it('ranks PDF fixes by the equal 25% graded weight, not the 12-section rubric weight', () => {
    const { audit } = runPdfAudit(CAPTURED_PROFILES.Mir);
    expect(audit.fixes.length).toBeGreaterThan(0);
    for (const fix of audit.fixes) {
      const s = audit.sections.find((x) => x.id === fix.sectionId)!;
      const gap = Math.max(1, scoreToNextLetterThreshold(s.adjustedScore) - s.adjustedScore);
      // pointsGain = weight × gap, and in PDF mode every graded section weighs
      // 0.25 — not its 0.16/0.18/0.14/0.10 full-rubric weight.
      expect(fix.pointsGain).toBeCloseTo(Math.round(0.25 * gap * 100) / 100, 5);
    }
  });

  it('labels PDF wins/fixes with the PDF display label (Career Arc, not "Experience (full history)")', () => {
    // Strong everything except a stub-only history → Career Arc is a top fix.
    const profile = makeProfile({
      headline: {
        data: 'Head of Product | Driving Growth Strategy | Building High-Performing Teams across Markets',
        confidence: 'high',
      },
      about: { data: CAPTURED_PROFILES.John.about.data, confidence: 'high' },
      currentExperience: {
        data: entry({
          title: 'Head of Product',
          description: 'Led a team of 25 and grew revenue 40% to $12M while shipping 4 products.',
        }),
        confidence: 'high',
      },
      experienceHistory: {
        data: [
          entry({ title: 'Head of Product', description: 'Current rich role.' }),
          entry({ title: 'Analyst', description: null }),
          entry({ title: 'Intern', description: null }),
        ],
        confidence: 'high',
      },
    });
    const { audit } = runPdfAudit(profile);
    const arcFix = audit.fixes.find((f) => f.sectionId === 'experienceHistory');
    expect(arcFix).toBeDefined();
    expect(arcFix!.label).toBe('Career Arc');
    // Every PDF fix carries its PDF display label, not the 12-section label.
    const labelById = new Map(PDF_AUDIT_SECTIONS.map((s) => [s.id, s.displayLabel]));
    for (const f of audit.fixes) {
      expect(f.label).toBe(labelById.get(f.sectionId));
    }
  });

  it('ignores non-graded sections in computeComposite when graded weights are supplied', () => {
    const base = (id: SectionId, adjusted: number): SectionScore => ({
      id,
      label: id,
      weight: 0.25,
      rawScore: adjusted,
      adjustedScore: adjusted,
      letter: 'C',
      reasons: [],
      oneLineWhy: '',
      aboveTheFold: false,
      needsReview: false,
    });
    const gradedWeights = new Map<SectionId, number>(
      PDF_AUDIT_SECTION_IDS.map((id) => [id, 0.25]),
    );
    const sections: SectionScore[] = [
      base('headline', 80),
      base('about', 80),
      base('currentExperience', 80),
      base('experienceHistory', 80),
      base('photo', 0), // non-graded extreme value
      base('banner', 100), // non-graded extreme value
    ];
    const composite = computeComposite(sections, 'T2', false, gradedWeights);
    // Only the 4 graded sections (all 80) count — the 0 and 100 are ignored.
    expect(composite.score).toBe(80);
  });
});
