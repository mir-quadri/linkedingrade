import type { Letter, SectionScore, CompositeResult, SeniorityTier, SectionId } from '@/lib/engine/types';
import { scoreToLetter } from './letters';
import { sectionMeta, PDF_INVISIBLE_SECTION_IDS } from './weights';
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
 *     Recommendations. Included ONLY when the user has actually
 *     answered the corresponding self-assessed checklist question.
 *     The set of answered invisible section IDs is passed via
 *     `invisibleSelfReportedIds`. Unanswered invisible sections are
 *     excluded so their section-scorer parser-fallback values
 *     (60/65 — "could not extract") never leak into the composite
 *     under the guise of self-report signal.
 *
 *   Even when at least one invisible section is answered, the
 *   combined contribution is capped at `PDF_INVISIBLE_WEIGHT_CAP`
 *   of the composite, and a poor self-report can never lower the
 *   composite below the visible-only baseline. See
 *   `pdfCompositeConfig.ts`.
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
  const { invisibleSelfReportedIds } = options;

  const visibleSections: SectionScore[] = [];
  const invisibleSections: SectionScore[] = [];
  for (const s of sections) {
    if (sectionMeta(s.id).pdfVisible) {
      visibleSections.push(s);
    } else if (invisibleSelfReportedIds?.has(s.id)) {
      // Only include the specific invisible sections the user actually
      // answered. A partial / empty self-report would otherwise drag
      // unanswered sections' parser-fallback scores (60 / 65 — the
      // section scorers' "could not extract" defaults) into the
      // invisible average and present them as verified signal.
      invisibleSections.push(s);
    }
  }

  const visibleScore = weightedAverage(visibleSections);
  if (invisibleSections.length === 0) {
    return finalize(visibleScore, tier, tierAssumed);
  }

  // At-least-one-answered branch: the invisible sections get up to
  // `PDF_INVISIBLE_WEIGHT_CAP`, PRORATED by the fraction of invisible
  // sections the user actually answered. Without proration a lone
  // strong photo answer would lift the composite about as much as
  // all five strong self-assessed sections — overstating partial
  // signal. With proration:
  //
  //   proratedCap = cap × (answered / total_invisible_sections)
  //
  // 1 answer (of 5) gets 0.15 × 1/5 = 3% weight; 5 answers gets the
  // full 15%. Unanswered sections are treated as neutral (their
  // share of the cap is reclaimed by the visible-only fraction
  // rather than redistributed across the answered subset).
  //
  // Then the floor: a poor self-report can NEVER lower the composite
  // below the no-self-report baseline — that's the "self-report
  // only ever adds" invariant.
  const proratedCap =
    PDF_INVISIBLE_WEIGHT_CAP * (invisibleSections.length / PDF_INVISIBLE_SECTION_IDS.length);
  const invisibleScore = weightedAverage(invisibleSections);
  const blended = visibleScore * (1 - proratedCap) + invisibleScore * proratedCap;
  const finalScore = Math.max(visibleScore, blended);
  return finalize(finalScore, tier, tierAssumed);
}

export interface ComputeCompositeOptions {
  /**
   * The set of PDF-invisible section IDs the user has actually
   * answered in the self-assessed checklist. Only sections in this
   * set enter the composite as invisible signal — unanswered
   * sections are excluded entirely so the section scorers' parser-
   * fallback "could not extract" defaults never leak into the
   * invisible average. Omit or pass an empty set when no self-report
   * is attached: the composite falls through to the visible-only
   * weighted average.
   */
  invisibleSelfReportedIds?: ReadonlySet<SectionId>;
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
