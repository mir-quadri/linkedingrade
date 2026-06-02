import { describe, expect, it } from 'vitest';

import { runPdfAudit } from '@/lib/engine/scoring';
import { CAPTURED_PROFILES } from './fixtures';

/**
 * Smoke test against the 5 captured production profiles (anonymised — see
 * `fixtures.ts`). The pre-PR #15 engine clustered all 5 composites in a
 * 1.9-point band at F (56.3–58.2). The recalibrated 4-section audit must
 * differentiate them: a meaningful spread AND a sensible ranking.
 */
describe('5-profile smoke test (PR #15 recalibration)', () => {
  const results = Object.fromEntries(
    Object.entries(CAPTURED_PROFILES).map(([name, profile]) => {
      const { audit, profile: normalized } = runPdfAudit(profile);
      return [name, { score: audit.composite.score, profile: normalized }];
    }),
  ) as Record<string, { score: number; profile: ReturnType<typeof runPdfAudit>['profile'] }>;

  it('spreads the 5 composites by at least 12 points', () => {
    const scores = Object.values(results).map((r) => r.score);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThanOrEqual(12);
  });

  it('ranks the profiles Erum > John > Sidra > Mir > Michael', () => {
    expect(results.Erum.score).toBeGreaterThan(results.John.score);
    expect(results.John.score).toBeGreaterThan(results.Sidra.score);
    expect(results.Sidra.score).toBeGreaterThan(results.Mir.score);
    expect(results.Mir.score).toBeGreaterThan(results.Michael.score);
  });

  it('flags the misparsed-name profile as low confidence', () => {
    // Erum's profile carries the parser-bug name bleed; the audit must not
    // surface a garbage name.
    expect(results.Erum.profile.nameConfidence).toBe('low');
    expect(results.Erum.profile.fullName).toBeNull();
  });

  it('keeps trusted names intact', () => {
    expect(results.Michael.profile.nameConfidence).toBe('high');
    expect(results.Michael.profile.fullName).toBe('Michael J.');
  });
});
