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
    reasons: [],
    oneLineWhy: '',
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
  it('returns exactly the documented preview sections in canonical order', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    expect(preview.previewSections.map((s) => s.id)).toEqual(PREVIEW_SECTION_IDS);
    expect(preview.previewSections.map((s) => s.id)).toEqual(['headline', 'about', 'currentExperience']);
  });

  it('reports the correct gated section count', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    expect(preview.gatedSectionCount).toBe(audit.sections.length - PREVIEW_SECTION_IDS.length);
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
