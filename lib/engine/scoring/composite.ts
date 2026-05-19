import type { Letter, SectionScore, CompositeResult, SeniorityTier } from '@/lib/engine/types';
import { scoreToLetter } from './letters';

/**
 * Compute the composite score from the section scores.
 * The weighted average uses the **adjusted** (post-seniority) section scores,
 * per RUBRIC.md § 1: "the *internal section scores* that feed it are adjusted
 * by seniority first."
 */
export function computeComposite(
  sections: SectionScore[],
  tier: SeniorityTier,
  tierAssumed: boolean,
): CompositeResult {
  let total = 0;
  let totalWeight = 0;
  for (const s of sections) {
    total += s.adjustedScore * s.weight;
    totalWeight += s.weight;
  }
  // Normalize in case weights don't perfectly sum (defensive against rounding).
  const score = totalWeight > 0 ? total / totalWeight : 0;
  const letter: Letter = scoreToLetter(score);
  return {
    score: Math.round(score * 10) / 10,
    letter,
    tier,
    tierAssumed,
    // RUBRIC-ASSUMPTION: the percentile-band field is intentionally suppressed
    // in v0 — there is no real audit-data distribution behind the boundaries
    // yet (RUBRIC.md § 6 validation backlog). The field stays on the shape so
    // the popup / future PDF report can light up automatically once measured
    // bands replace the placeholders.
    percentileBand: null,
  };
}
