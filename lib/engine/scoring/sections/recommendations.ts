import type { ProfileData } from '@/lib/engine/types';

export interface RecommendationsScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

export function scoreRecommendations(profile: ProfileData): RecommendationsScore {
  const recs = profile.recommendations.data;
  const reasons: string[] = [];

  if (!recs || recs.count === null) {
    return {
      rawScore: 65,
      reasons: ['Recommendations could not be reliably extracted.'],
      oneLineWhy: 'Recommendations data unavailable.',
      needsReview: true,
    };
  }

  let score = 70;

  if (recs.count === 0) {
    score = 50;
    reasons.push('No recommendations.');
  } else if (recs.count >= 5) {
    score = 88;
    reasons.push(`${recs.count} recommendations on file.`);
  } else if (recs.count >= 3) {
    score = 80;
    reasons.push(`${recs.count} recommendations — solid social proof.`);
  } else {
    score = 72;
    reasons.push(`${recs.count} recommendation(s) — thin signal.`);
  }

  if (recs.recentCount !== null) {
    if (recs.recentCount >= 2) {
      score += 5;
      reasons.push(`${recs.recentCount} recent (last 18 months).`);
    } else if (recs.count > 0 && recs.recentCount === 0) {
      score -= 6;
      reasons.push('All recommendations are old — no recent vouches.');
    }
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
  if (score >= 90) return 'Several, recent, credible.';
  if (score >= 78) return 'A few recommendations; depth or recency could improve.';
  if (score >= 70) return 'One or two, or all of them old.';
  return 'No recommendations to vouch for the work.';
}
