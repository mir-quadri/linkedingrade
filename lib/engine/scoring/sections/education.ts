import type { ProfileData } from '@/lib/engine/types';

export interface EducationScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

/**
 * RUBRIC-ASSUMPTION: relevance is hard to judge without role-family context.
 * v0 scores on presence + ordering hygiene; the AI judge will be wired in here
 * when role-family keyword lists land (RUBRIC.md § 6).
 */
export function scoreEducation(profile: ProfileData): EducationScore {
  const edu = profile.education.data ?? [];
  const certs = profile.certifications.data ?? [];
  const reasons: string[] = [];

  if (edu.length === 0 && certs.length === 0) {
    // Distinguish "extractor missed both sections" from "sections genuinely
    // empty". Localised profiles or DOM shifts where neither heading was
    // matched shouldn't read as a confirmed-F result. 'low' confidence
    // covers the selector-drift case (heading found, entries didn't parse).
    const eduMissed =
      profile.education.confidence === 'missing' ||
      profile.education.confidence === 'low';
    const certsMissed =
      profile.certifications.confidence === 'missing' ||
      profile.certifications.confidence === 'low';
    if (eduMissed && certsMissed) {
      return {
        rawScore: 60,
        reasons: ['Education and certifications could not be extracted from the page.'],
        oneLineWhy: 'Education could not be extracted — flagged for review.',
        needsReview: true,
      };
    }
    // Per RUBRIC.md § 4.11: "F (0–59): Missing where it would be expected,
    // or pure clutter." 60 sat at the D/F boundary and effectively
    // over-scored fully-absent credentials.
    return {
      rawScore: 50,
      reasons: ['No education or certifications listed.'],
      oneLineWhy: 'Section is empty where it would normally appear.',
      needsReview: false,
    };
  }

  let score = 80;

  if (edu.length > 0) {
    reasons.push(`${edu.length} education entry/entries listed.`);
  } else {
    score -= 6;
    reasons.push('No formal education listed.');
  }

  if (certs.length > 0) {
    reasons.push(`${certs.length} certification(s) listed.`);
    if (certs.length > 8) {
      score -= 5;
      reasons.push('Long cert list may be diluting the strong items.');
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
  if (score >= 90) return 'Relevant, current, well-ordered.';
  if (score >= 75) return 'Present but cluttered or oddly ordered.';
  return 'Missing where it would be expected, or pure clutter.';
}
