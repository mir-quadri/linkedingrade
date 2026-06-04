import { describe, expect, it } from 'vitest';

import { buildPreview } from '../buildPreview';
import type { AuditResult, SectionScore } from '@/lib/engine/types';

function section(id: SectionScore['id']): SectionScore {
  return {
    id,
    label: id,
    weight: 0.1,
    rawScore: 70,
    adjustedScore: 70,
    letter: 'B',
    reasons: ['internal reason'],
    oneLineWhy: 'internal why',
    aboveTheFold: false,
    needsReview: false,
  };
}

const audit: AuditResult = {
  url: 'https://www.linkedin.com/in/x',
  generatedAt: '2026-05-21T00:00:00Z',
  composite: { score: 70, letter: 'B', tier: 'T2', tierAssumed: false, percentileBand: null },
  sections: [
    section('headline'),
    section('photo'),
    section('banner'),
    section('about'),
    section('currentExperience'),
    section('experienceHistory'),
    section('skills'),
    section('featured'),
    section('activity'),
    section('recommendations'),
    section('education'),
    section('keywordHealth'),
  ],
  wins: [{ sectionId: 'headline', label: 'Headline', letter: 'B', why: 'should not leak' }],
  fixes: [
    {
      sectionId: 'about',
      label: 'About',
      currentLetter: 'C',
      targetLetter: 'B',
      pointsGain: 5,
      effort: 'low',
      recommendation: 'should not leak before the gate',
    },
  ],
  heatMap: [],
  judgeStatus: 'ok',
  warnings: [],
};

/**
 * Codex P1 regression: the upload response previously carried the full
 * report alongside the preview, so a DevTools inspection let any visitor
 * bypass the email gate. These tests guard the preview-shape contract —
 * if anything that the preview emits inadvertently grows to include the
 * full sections / wins / fixes again, the gate is back to performative.
 */
describe('buildPreview gate contract', () => {
  it('reveals all 4 graded sections (the grades are no longer gated)', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    expect(preview.previewSections.map((s) => s.id)).toEqual([
      'headline',
      'about',
      'currentExperience',
      'experienceHistory',
    ]);
    // The remaining 8 parsed sections are the extension's — shown as a
    // callout, never graded in the PDF composite.
    const previewIds = new Set(preview.previewSections.map((s) => s.id));
    const nonGraded = audit.sections.filter((s) => !previewIds.has(s.id));
    expect(nonGraded).toHaveLength(8);
  });

  it('preview shape does not include the gated report (wins/fixes) or internals', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    const keys = Object.keys(preview);
    expect(keys).not.toContain('wins');
    expect(keys).not.toContain('fixes');
    expect(keys).not.toContain('sections');
    expect(keys).not.toContain('heatMap');
    expect(keys).not.toContain('warnings');
  });

  it('preview serialised to JSON does not contain the gated fix recommendation or win text', () => {
    const preview = buildPreview(audit, 'Jane Doe');
    expect(JSON.stringify(preview)).not.toContain('should not leak before the gate');
    expect(JSON.stringify(preview)).not.toContain('should not leak');
  });

  it('preview does not ship rendered-nowhere section fields (numeric scores / reasons)', () => {
    const json = JSON.stringify(buildPreview(audit, 'Jane Doe'));
    expect(json).not.toContain('rawScore');
    expect(json).not.toContain('adjustedScore');
    expect(json).not.toContain('reasons');
  });
});
