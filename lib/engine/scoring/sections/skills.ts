import type { ProfileData } from '@/lib/engine/types';

export interface SkillsScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

const GENERIC_SKILLS = new Set([
  'microsoft office',
  'microsoft word',
  'microsoft excel',
  'powerpoint',
  'communication',
  'teamwork',
  'leadership',
  'time management',
  'public speaking',
  'customer service',
  'social media',
  'problem solving',
]);

/**
 * Skills scoring is partly structural (size, top-3 generic-ness) and partly
 * semantic (alignment with the target role). The AI judge currently does not
 * supply skill-alignment input — RUBRIC-ASSUMPTION: structural signals are a
 * sufficient v0 proxy; alignment is a v1 enhancement once role-family
 * keyword lists are validated (RUBRIC.md § 6).
 */
export function scoreSkills(profile: ProfileData): SkillsScore {
  const skills = profile.skills.data;
  const reasons: string[] = [];

  if (!skills || skills.all.length === 0) {
    // 'low' covers section-found-but-no-skills-parsed (redesigned markup);
    // 'missing' covers heading not found. Both are uncertainty.
    const extractionMissed =
      profile.skills.confidence === 'missing' ||
      profile.skills.confidence === 'low';
    return {
      rawScore: extractionMissed ? 60 : 35,
      reasons: [
        extractionMissed
          ? 'Skills could not be extracted from the page.'
          : 'No skills detected.',
      ],
      oneLineWhy: extractionMissed
        ? 'Skills could not be extracted — flagged for review.'
        : 'No skills listed — algorithmic invisibility.',
      needsReview: extractionMissed,
    };
  }

  let score = 75;
  const totalCount = skills.all.length;
  const topThree = skills.topThree.map((s) => s.toLowerCase());

  if (totalCount < 5) {
    score -= 8;
    reasons.push(`Only ${totalCount} skills listed — too thin for the algorithm.`);
  } else if (totalCount > 30) {
    score -= 4;
    reasons.push('Skill list sprawls past 30 — priority is muddled.');
  }

  const genericInTop = topThree.filter((s) => GENERIC_SKILLS.has(s));
  if (genericInTop.length > 0) {
    score -= 8 * genericInTop.length;
    reasons.push(`Top-3 includes generic skill(s): ${genericInTop.join(', ')}.`);
  }

  if (skills.topThree.length === 3) {
    score += 4;
    reasons.push('Top-3 slot is filled.');
  } else {
    score -= 6;
    reasons.push('Top-3 skills slot is incomplete.');
  }

  // Endorsement signal: do top-3 have any endorsements?
  const endorsements = skills.topThree
    .map((s) => skills.endorsementCounts[s] ?? 0)
    .reduce((a, b) => a + b, 0);
  if (endorsements >= 10) {
    score += 4;
    reasons.push('Top-3 skills carry endorsement weight.');
  } else if (endorsements === 0) {
    score -= 3;
    reasons.push('Top-3 skills have no endorsements visible.');
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
  if (score >= 90) return 'Top-3 skills are exactly what the target role screens for.';
  if (score >= 80) return 'Skills are present; top-3 priority could sharpen.';
  if (score >= 70) return 'Skills present but the priority order is wrong.';
  return 'Skills missing or actively misaligned.';
}
