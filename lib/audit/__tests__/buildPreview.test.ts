import { describe, expect, it } from 'vitest';

import { buildPreview, PREVIEW_SECTION_IDS } from '../buildPreview';
import type { AuditResult, SectionScore } from '@/lib/engine/types';

function section(id: SectionScore['id'], letter: SectionScore['letter']): SectionScore {
  return {
    id,
    label: id,
    weight: 0.1,
    rawScore: 70,
    adjustedScore: 70,
    letter,
    reasons: ['internal structural reason'],
    oneLineWhy: 'one line why',
    aboveTheFold: false,
    needsReview: false,
  };
}

const audit: AuditResult = {
  url: 'https://www.linkedin.com/in/x',
  generatedAt: '2026-05-21T00:00:00Z',
  composite: { score: 70, letter: 'B', tier: 'T2', tierAssumed: false, percentileBand: null },
  sections: [
    section('headline', 'B+'),
    section('photo', 'C'),
    section('banner', 'C'),
    section('about', 'B'),
    section('currentExperience', 'A-'),
    section('experienceHistory', 'B'),
    section('skills', 'B'),
    section('featured', 'D'),
    section('activity', 'D'),
    section('recommendations', 'D'),
    section('education', 'B+'),
    section('keywordHealth', 'B'),
  ],
  wins: [],
  fixes: [],
  heatMap: [],
  judgeStatus: 'partial',
  warnings: [],
};

describe('buildPreview', () => {
  it('returns the 4 graded sections in PDF display order', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    expect(preview.previewSections.map((s) => s.id)).toEqual(PREVIEW_SECTION_IDS);
    expect(preview.previewSections.map((s) => s.id)).toEqual([
      'headline',
      'about',
      'currentExperience',
      'experienceHistory',
    ]);
  });

  it('applies the "Career Arc" display label to experienceHistory', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    const arc = preview.previewSections.find((s) => s.id === 'experienceHistory');
    expect(arc?.label).toBe('Career Arc');
  });

  it('reveals the same letters that the full audit carries (no bait-and-switch)', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    for (const s of preview.previewSections) {
      const full = audit.sections.find((x) => x.id === s.id)!;
      expect(s.letter).toBe(full.letter);
    }
  });

  it('ships only the rendered section fields — no numeric scores or reasons', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    for (const s of preview.previewSections) {
      expect(Object.keys(s).sort()).toEqual(
        ['aboveTheFold', 'id', 'label', 'letter', 'needsReview', 'oneLineWhy'].sort(),
      );
    }
    const json = JSON.stringify(preview);
    expect(json).not.toContain('rawScore');
    expect(json).not.toContain('adjustedScore');
    expect(json).not.toContain('reasons');
    expect(json).not.toContain('internal structural reason');
  });

  it('forwards fullName and composite verbatim', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    expect(preview.fullName).toBe('Jane Doe');
    expect(preview.composite).toBe(audit.composite);
  });

  it('handles a null fullName for anonymous preview cards', () => {
    const preview = buildPreview(audit, null);
    expect(preview.fullName).toBeNull();
  });
});
