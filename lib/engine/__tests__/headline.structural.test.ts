import { describe, expect, it } from 'vitest';

import { scoreHeadline } from '@/lib/engine/scoring/sections/headline';
import { scoreToLetter, B_PLUS_CEILING } from '@/lib/engine/scoring/letters';
import { makeProfile } from './fixtures';

function rawForHeadline(headline: string): number {
  const profile = makeProfile({ headline: { data: headline, confidence: 'high' } });
  return scoreHeadline(profile, undefined).rawScore;
}

describe('headline structural signal', () => {
  it('grades a pipe-rich, keyword-dense headline at B+ (structural ceiling)', () => {
    const raw = rawForHeadline(
      'Senior Director, Data Science | Building Enterprise AI Platforms | Driving Analytics Strategy | ML & Risk Transformation Leader',
    );
    expect(scoreToLetter(raw)).toBe('B+');
  });

  it('grades a bare-title headline at D or F', () => {
    const raw = rawForHeadline('VP, Payments Technology at JPMC');
    expect(['D', 'F']).toContain(scoreToLetter(raw));
  });

  it('grades a one-word title at F', () => {
    expect(scoreToLetter(rawForHeadline('Software Engineer'))).toBe('F');
  });

  it('rewards length, pipes, power words and keyword density additively', () => {
    const bare = rawForHeadline('Product Manager');
    const developed = rawForHeadline(
      'Head of Product | Driving Growth Strategy | Building High-Performing Teams across Fintech',
    );
    expect(developed).toBeGreaterThan(bare);
  });

  it('never exceeds the B+ structural ceiling on signals alone', () => {
    const maxed = rawForHeadline(
      'Founder & CEO | Building AI Platforms | Driving Enterprise Transformation Strategy | Growth & Product Leader across Global Markets',
    );
    expect(maxed).toBeLessThanOrEqual(B_PLUS_CEILING);
  });
});
