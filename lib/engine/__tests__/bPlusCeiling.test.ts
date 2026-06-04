import { describe, expect, it } from 'vitest';

import { runScoring } from '@/lib/engine/scoring';
import { B_PLUS_CEILING } from '@/lib/engine/scoring/letters';
import { makeProfile, entry, CAPTURED_PROFILES } from './fixtures';

describe('B+ ceiling on AI-pending (needsReview) sections', () => {
  it('caps a structural-only section at adjusted ≤ B+ even when raw + modifier would exceed it', () => {
    // Early-career tier (Junior Analyst) so the +5 T1 modifier applies to a
    // high structural headline. The headline uses power words that are NOT
    // seniority titles ("Driving", "Building", "Strategy", "Growth") so the
    // tier stays T1 while the structural score climbs to the B+ band.
    const profile = makeProfile({
      fullName: 'Early Career',
      headline: {
        data: 'Driving Growth Strategy | Building Analytics Capabilities | Driving Data Excellence at Scale across Markets',
        confidence: 'high',
      },
      currentExperience: {
        data: entry({
          title: 'Junior Analyst',
          company: 'Co',
          description: 'Built dashboards and reduced reporting time 40% across 3 teams in 2 quarters.',
        }),
        confidence: 'high',
      },
      experienceHistory: {
        data: [entry({ title: 'Junior Analyst' }), entry({ title: 'Intern' })],
        confidence: 'high',
      },
    });

    const audit = runScoring(profile, {}, 'pdf');
    const headline = audit.sections.find((s) => s.id === 'headline')!;

    expect(audit.composite.tier).toBe('T1');
    expect(headline.needsReview).toBe(true);
    // High structural raw + a positive T1 modifier WOULD exceed the ceiling…
    expect(headline.rawScore).toBeGreaterThanOrEqual(85);
    // …but the cap holds the adjusted score at the B+ band, never A.
    expect(headline.adjustedScore).toBeLessThanOrEqual(B_PLUS_CEILING);
    expect(headline.letter.startsWith('A')).toBe(false);
  });

  it('holds the ceiling across every captured profile', () => {
    for (const profile of Object.values(CAPTURED_PROFILES)) {
      const audit = runScoring(profile, {}, 'pdf');
      for (const s of audit.sections) {
        if (s.needsReview) {
          expect(s.adjustedScore).toBeLessThanOrEqual(B_PLUS_CEILING);
        }
      }
    }
  });
});
