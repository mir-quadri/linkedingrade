import type { ProfileData } from '@/lib/engine/types';
import type { BannerJudgment } from '@/lib/engine/types/judge';

export interface BannerScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

export function scoreBanner(
  profile: ProfileData,
  judgment: BannerJudgment | undefined,
): BannerScore {
  const banner = profile.banner.data;

  // Extraction-missed branch: banner.data null with 'missing'/'low' means
  // selector drift. Could be a real default banner OR a markup change;
  // either way, treat as uncertainty rather than a confident default penalty.
  if (!banner) {
    const extractionMissed =
      profile.banner.confidence === 'missing' ||
      profile.banner.confidence === 'low';
    return {
      rawScore: extractionMissed ? 60 : 50,
      reasons: [
        extractionMissed
          ? 'Banner element could not be located on the page.'
          : 'No banner detected.',
      ],
      oneLineWhy: extractionMissed
        ? 'Banner could not be extracted — flagged for review.'
        : 'Default LinkedIn banner — wasted billboard slot.',
      needsReview: extractionMissed,
    };
  }

  if (!banner.present || banner.isDefault) {
    return {
      rawScore: 50,
      reasons: ['Default LinkedIn banner — wasted billboard slot.'],
      oneLineWhy: 'Default banner reads as effort not made.',
      needsReview: false,
    };
  }

  let score = 78;
  const reasons: string[] = ['Custom banner in place.'];

  // Tri-state: the proxy prompt allows fields to be omitted. A missing
  // communicatesSomething shouldn't be scored as if the model judged the
  // banner weak — that systematically under-scored custom banners on
  // partial responses.
  let unknownFields = 0;
  if (judgment) {
    if (judgment.communicatesSomething === true) {
      score += 12;
      reasons.push('Banner communicates something — a brand, a tagline, a portfolio cue.');
    } else if (judgment.communicatesSomething === false) {
      score -= 5;
      reasons.push('Custom banner, but it does not communicate anything specific.');
    } else {
      unknownFields++;
    }
    if (judgment.notes) reasons.push(judgment.notes);
  } else {
    reasons.push('Banner content evaluation pending AI review.');
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

function oneLine(score: number, j?: BannerJudgment): string {
  if (!j) return 'Custom banner detected — message quality pending AI review.';
  if (score >= 90) return 'Intentional, on-brand, adds a real signal.';
  if (score >= 75) return 'Non-default banner that says little.';
  return 'Banner is doing no work.';
}
