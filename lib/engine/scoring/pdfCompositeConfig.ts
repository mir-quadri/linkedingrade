import type { SectionId } from '@/lib/engine/types';
import type { SelfReport } from '@/lib/storage/auditStore';

/**
 * Maximum combined weight the five PDF-invisible sections (photo,
 * banner, featured, activity, recommendations) can claim in the PDF
 * composite when the user fills in the self-assessed checklist. The
 * PDF-visible sections always claim the remaining `1 - cap`.
 *
 * The cap exists because self-reported signal is qualitatively weaker
 * than parsed signal — the user has obvious incentives to overstate
 * presence and quality, and the answers aren't independently verified.
 * 15% lets the self-report move the composite by ~10 points end-to-end
 * (the realistic envelope between all-yes and all-no answers at the
 * cap) — enough to reward a profile that's clearly stronger off-page,
 * not enough to swamp the parser-graded sections.
 *
 * The product-defining bug this calibration fixes was the opposite:
 * the PDF-invisible sections used to claim ~28% of the composite at
 * their RUBRIC.md nominal weights, all defaulting to F because the
 * parser cannot see them. The result was a composite spread of less
 * than 1 point across four very different profiles.
 */
export const PDF_INVISIBLE_WEIGHT_CAP = 0.15;

/**
 * Map self-report answers to a 0-100 rawScore for each PDF-invisible
 * section. Returns `null` for any section the user didn't answer — the
 * composite skips unanswered sections rather than treating them as
 * worst-case.
 *
 * The score curves are deliberately conservative on the upside (a
 * confident "yes" only gets to ~85) and gentle on the downside (a
 * confident "no" only drops to ~30) because:
 *   - Even a verified-present photo on LinkedIn has a quality ceiling
 *     before the AI judge weighs in.
 *   - "No" answers usually mean the user hasn't set the thing up yet,
 *     not that the thing is actively harmful.
 * The shape is intentionally similar to each section scorer's existing
 * fallback range so the composite doesn't pivot wildly at the moment a
 * user fills in the checklist.
 */
export function scoreSelfReportSection(
  sectionId: SectionId,
  selfReport: SelfReport,
): { rawScore: number; oneLineWhy: string } | null {
  switch (sectionId) {
    case 'photo':
      if (selfReport.photo === 'yes') {
        return {
          rawScore: 85,
          oneLineWhy: 'Self-assessed: clear, professional headshot.',
        };
      }
      if (selfReport.photo === 'somewhat') {
        return {
          rawScore: 60,
          oneLineWhy: 'Self-assessed: photo present but dated or off-tone.',
        };
      }
      if (selfReport.photo === 'no') {
        return {
          rawScore: 30,
          oneLineWhy: 'Self-assessed: no photo, or default avatar.',
        };
      }
      return null;
    case 'banner':
      if (selfReport.banner === 'yes') {
        return {
          rawScore: 85,
          oneLineWhy: 'Self-assessed: custom, intentional banner.',
        };
      }
      if (selfReport.banner === 'generic') {
        return {
          rawScore: 55,
          oneLineWhy: 'Self-assessed: generic LinkedIn template banner.',
        };
      }
      if (selfReport.banner === 'no') {
        return {
          rawScore: 35,
          oneLineWhy: 'Self-assessed: no banner set.',
        };
      }
      return null;
    case 'activity':
      if (selfReport.activity === 'yes') {
        return {
          rawScore: 88,
          oneLineWhy: 'Self-assessed: posting / commenting weekly.',
        };
      }
      if (selfReport.activity === 'occasional') {
        return {
          rawScore: 65,
          oneLineWhy: 'Self-assessed: occasional activity.',
        };
      }
      if (selfReport.activity === 'no') {
        return {
          rawScore: 35,
          oneLineWhy: 'Self-assessed: silent for at least 30 days.',
        };
      }
      return null;
    case 'recommendations':
      if (selfReport.recommendations === 'yes') {
        return {
          rawScore: 88,
          oneLineWhy: 'Self-assessed: 3+ recent recommendations.',
        };
      }
      if (selfReport.recommendations === '1-2') {
        return {
          rawScore: 58,
          oneLineWhy: 'Self-assessed: 1-2 recommendations.',
        };
      }
      if (selfReport.recommendations === 'none') {
        return {
          rawScore: 32,
          oneLineWhy: 'Self-assessed: no recommendations yet.',
        };
      }
      return null;
    case 'featured':
      if (selfReport.featured === 'yes') {
        return {
          rawScore: 82,
          oneLineWhy: 'Self-assessed: Featured section populated.',
        };
      }
      if (selfReport.featured === 'no') {
        return {
          rawScore: 38,
          oneLineWhy: 'Self-assessed: Featured section empty or absent.',
        };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Phrase the PDF-invisible sections use in their `oneLineWhy` when no
 * self-report has been submitted — so the report makes the gap explicit
 * rather than presenting an unscored 0 / F as a verdict.
 */
export const PDF_INVISIBLE_NO_SELF_REPORT_MESSAGE =
  'Not visible to this audit — fill in the self-assessed block to grade it.';
