import type { Letter, SectionScore, CompositeResult, SeniorityTier } from '@/lib/engine/types';
import { scoreToLetter } from './letters';
import { sectionMeta } from './weights';
import { PDF_INVISIBLE_WEIGHT_CAP } from './pdfCompositeConfig';

/**
 * Compute the composite score from the section scores for a
 * PDF-sourced audit. The calc splits sections into two groups:
 *
 *   PDF-VISIBLE — Headline, About, Current Experience, Experience
 *     History, Skills, Education, Keyword Health. The composite is a
 *     weighted average over these, with their nominal weights
 *     renormalised so they sum to 1.0 of whatever fraction of the
 *     composite they're allowed to claim.
 *
 *   PDF-INVISIBLE — Photo, Banner, Featured, Activity,
 *     Recommendations. EXCLUDED entirely from the composite when the
 *     user hasn't filled in the self-assessed checklist. Included at
 *     reduced weight (capped at `PDF_INVISIBLE_WEIGHT_CAP` of the
 *     composite, currently 15%) when the user has — and even then a
 *     poor self-report can never lower the composite below the
 *     visible-only baseline. See `pdfCompositeConfig.ts`.
 *
 * The split fixes a product-defining miscalibration: under the
 * RUBRIC.md nominal weights, the PDF-invisible sections claimed ~28%
 * of the composite and all defaulted to F (the parser can't see them),
 * producing a 0.6-point spread across four very different profiles
 * instead of a meaningful ordering.
 *
 * The Chrome-extension code path will eventually need its own
 * computeComposite that uses ALL sections at nominal weight — the
 * extension sees the photo, banner, activity, etc directly. Until
 * that ships, this PDF-flavoured calc is the only one in use.
 */
export function computeComposite(
  sections: SectionScore[],
  tier: SeniorityTier,
  tierAssumed: boolean,
  options: ComputeCompositeOptions = {},
): CompositeResult {
  const { hasSelfReport = false } = options;

  const visibleSections: SectionScore[] = [];
  const invisibleSections: SectionScore[] = [];
  for (const s of sections) {
    if (sectionMeta(s.id).pdfVisible) {
      visibleSections.push(s);
    } else if (hasSelfReport) {
      // Only the user-answered invisible sections are flagged via
      // `inComposite` upstream in `runScoring` — runScoring sets the
      // section's `oneLineWhy` to the no-self-report message and
      // clears its data for unanswered invisible sections, but the
      // selector here is simpler: invisible sections enter the
      // composite when ANY self-report exists, and the invisible
      // weighted average naturally drops anyone who hasn't been
      // answered (their rawScore reverts to the section scorer's
      // fallback, but their weight is renormalised against only the
      // sections that ARE in this list).
      invisibleSections.push(s);
    }
  }

  const visibleScore = weightedAverage(visibleSections);
  if (!hasSelfReport || invisibleSections.length === 0) {
    return finalize(visibleScore, tier, tierAssumed);
  }

  // hasSelfReport branch: the invisible sections get up to
  // `PDF_INVISIBLE_WEIGHT_CAP` combined. The visible sections claim
  // `1 - cap`. Compute the blended composite, then floor at the
  // visible-only score so a poor self-report can NEVER lower the
  // composite below the no-self-report baseline. This is the
  // "self-report only ever adds" invariant.
  const invisibleScore = weightedAverage(invisibleSections);
  const blended =
    visibleScore * (1 - PDF_INVISIBLE_WEIGHT_CAP) +
    invisibleScore * PDF_INVISIBLE_WEIGHT_CAP;
  const finalScore = Math.max(visibleScore, blended);
  return finalize(finalScore, tier, tierAssumed);
}

export interface ComputeCompositeOptions {
  /**
   * Whether the audit has self-assessed checklist data attached.
   * Drives whether PDF-invisible sections enter the composite at all.
   * Defaults to false — runScoring callers that don't pass a
   * selfReport get the visible-only composite, which is the right
   * default for a freshly-uploaded PDF.
   */
  hasSelfReport?: boolean;
}

/**
 * Weighted average over a section list, using each section's nominal
 * weight from RUBRIC.md § 2 and renormalising the weights so they sum
 * to 1.0 across just the supplied sections.
 */
function weightedAverage(sections: SectionScore[]): number {
  if (sections.length === 0) return 0;
  let total = 0;
  let totalWeight = 0;
  for (const s of sections) {
    total += s.adjustedScore * s.weight;
    totalWeight += s.weight;
  }
  return totalWeight > 0 ? total / totalWeight : 0;
}

function finalize(score: number, tier: SeniorityTier, tierAssumed: boolean): CompositeResult {
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
