import type { ProfileData } from '@/lib/engine/types';
import { countQuantifiers } from '../buzzwords';

export interface ExperienceHistoryScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

/**
 * The full-history score is structural — does each role have a description,
 * is there outcome language, are gaps obvious. The AI judge is not strictly
 * needed here; we use the structural signals.
 */
export function scoreExperienceHistory(profile: ProfileData): ExperienceHistoryScore {
  const entries = profile.experienceHistory.data ?? [];
  const reasons: string[] = [];

  if (entries.length === 0) {
    // 'low' confidence covers Experience-section-found-but-no-entries-
    // parsed; 'missing' covers section-not-found. Either way, treat as
    // uncertainty rather than a confident negative.
    const extractionMissed =
      profile.experienceHistory.confidence === 'missing' ||
      profile.experienceHistory.confidence === 'low';
    return {
      rawScore: extractionMissed ? 60 : 35,
      reasons: [
        extractionMissed
          ? 'Experience history could not be extracted from the page.'
          : 'No experience history detected.',
      ],
      oneLineWhy: extractionMissed
        ? 'History could not be extracted — flagged for review.'
        : 'No prior roles visible.',
      needsReview: extractionMissed,
    };
  }

  if (entries.length === 1) {
    return {
      rawScore: 65,
      reasons: ['Only one role visible — no career arc to evaluate.'],
      oneLineWhy: 'Single role only — limited history to assess.',
      needsReview: false,
    };
  }

  // Look at non-current roles only (skip index 0, the current role).
  const past = entries.slice(1);
  const withDescription = past.filter((e) => (e.description?.trim().length ?? 0) >= 40);
  const withQuantifiers = past.filter((e) => countQuantifiers(e.description) >= 1);

  const descRatio = withDescription.length / past.length;
  const quantRatio = withQuantifiers.length / past.length;

  let score = 70;
  if (descRatio >= 0.8) {
    score += 8;
    reasons.push('Most past roles have substantive descriptions.');
  } else if (descRatio <= 0.2) {
    score -= 12;
    reasons.push('Most past roles are bare title-and-date stubs.');
  } else {
    reasons.push(`${Math.round(descRatio * 100)}% of past roles have a description.`);
  }

  if (quantRatio >= 0.5) {
    score += 6;
    reasons.push('Outcome language is consistent across the history.');
  } else if (quantRatio <= 0.1) {
    score -= 6;
    reasons.push('Past roles lack outcome/quantification language.');
  }

  return {
    rawScore: clamp(score),
    reasons,
    oneLineWhy: oneLine(score),
    needsReview: false,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function oneLine(score: number): string {
  if (score >= 90) return 'The whole arc is told well, not just the current role.';
  if (score >= 80) return 'History is solid; one or two roles need depth.';
  if (score >= 70) return 'Current role is fine; everything before it is skeletal.';
  return 'History reads as title-and-date stubs.';
}
