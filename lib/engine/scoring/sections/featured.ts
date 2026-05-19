import type { ProfileData } from '@/lib/engine/types';
import type { FeaturedJudgment } from '@/lib/engine/types/judge';

export interface FeaturedScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

export function scoreFeatured(
  profile: ProfileData,
  judgment: FeaturedJudgment | undefined,
): FeaturedScore {
  const items = profile.featured.data ?? [];

  if (items.length === 0) {
    // Distinguish a real-empty shelf from an extraction miss. 'missing' or
    // 'low' confidence covers DOM drift / localised label cases where the
    // heading wasn't matched.
    const extractionMissed =
      profile.featured.confidence === 'missing' ||
      profile.featured.confidence === 'low';
    return {
      rawScore: extractionMissed ? 65 : 45,
      reasons: [
        extractionMissed
          ? 'Featured section could not be extracted from the page.'
          : 'Featured section is empty.',
      ],
      oneLineWhy: extractionMissed
        ? 'Featured could not be extracted — flagged for review.'
        : 'Empty Featured shelf — the best proof of work is hidden.',
      needsReview: extractionMissed,
    };
  }

  let score = 78;
  const reasons: string[] = [`${items.length} featured item(s) present.`];

  // Tri-state: the proxy prompt allows fields to be omitted. A missing
  // strongProof must not be scored as if the model judged the items weak.
  let unknownFields = 0;
  if (judgment) {
    if (judgment.strongProof === true) {
      score += 12;
      reasons.push('Featured items are genuinely strong proof — talks, writing, launches, press.');
    } else if (judgment.strongProof === false) {
      score -= 8;
      reasons.push('Featured items are weak or off-target.');
    } else {
      unknownFields++;
    }
    if (judgment.notes) reasons.push(judgment.notes);
  } else {
    reasons.push('Strength of featured items pending AI review.');
  }

  return {
    rawScore: clamp(score),
    reasons,
    oneLineWhy: oneLine(score, judgment),
    needsReview: !judgment || unknownFields > 0,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function oneLine(score: number, j?: FeaturedJudgment): string {
  if (!j) return 'Featured items present — strength pending AI review.';
  if (score >= 90) return 'The shelf shows the person\'s best, immediately.';
  if (score >= 75) return 'Featured exists but the content is weak.';
  return 'Featured shelf does not earn its slot.';
}
