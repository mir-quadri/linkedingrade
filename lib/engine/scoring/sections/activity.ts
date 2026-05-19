import type { ProfileData } from '@/lib/engine/types';

export interface ActivityScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

export function scoreActivity(profile: ProfileData): ActivityScore {
  const activity = profile.activity.data;

  if (!activity || activity.cadence === 'unknown') {
    return {
      rawScore: 65,
      reasons: ['Activity could not be reliably extracted.'],
      oneLineWhy: 'Activity data unavailable — could not score reliably.',
      needsReview: true,
    };
  }

  const reasons: string[] = [];
  let score = 70;

  switch (activity.cadence) {
    case 'silent':
      score = 55;
      reasons.push('No activity in 90+ days.');
      break;
    case 'sporadic':
      score = 75;
      reasons.push('Sporadic activity — present but not at a believable cadence.');
      break;
    case 'active':
      score = 90;
      reasons.push('Active and substantive at a sustainable cadence.');
      break;
  }

  if (activity.postsCount !== null) {
    reasons.push(`${activity.postsCount} recent post(s) detected.`);
  }
  if (activity.mostRecentDaysAgo !== null) {
    reasons.push(`Most recent activity ${activity.mostRecentDaysAgo} day(s) ago.`);
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
  if (score >= 90) return 'Active and substantive at a sustainable cadence.';
  if (score >= 75) return 'Sporadic, or present but low-quality.';
  return 'Silent for months — a recruiter sees disengagement.';
}
