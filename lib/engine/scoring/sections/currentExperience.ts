import type { ProfileData } from '@/lib/engine/types';
import type { ExperienceJudgment } from '@/lib/engine/types/judge';
import { countQuantifiers, scanBuzzwords } from '../buzzwords';

export interface CurrentExperienceScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

export function scoreCurrentExperience(
  profile: ProfileData,
  judgment: ExperienceJudgment | undefined,
): CurrentExperienceScore {
  const entry = profile.currentExperience.data;
  const reasons: string[] = [];

  if (!entry || (!entry.title && !entry.company)) {
    // Distinguish a real-missing current role from an extraction miss.
    // 'low' confidence covers the case where the Experience section was
    // found but no entries parsed (parser/DOM drift, redesigned markup);
    // 'missing' covers the section not being found at all. Both are
    // uncertainty — neither should be scored as a confident 30.
    const extractionMissed =
      profile.currentExperience.confidence === 'missing' ||
      profile.currentExperience.confidence === 'low';
    return {
      rawScore: extractionMissed ? 60 : 30,
      reasons: extractionMissed
        ? ['Current role could not be extracted from the page.']
        : ['No current role detected.'],
      oneLineWhy: extractionMissed
        ? 'Current role could not be extracted — flagged for review.'
        : 'Current role is missing — the first thing a recruiter checks.',
      needsReview: extractionMissed,
    };
  }

  const desc = entry.description?.trim() ?? '';
  if (desc.length === 0) {
    return {
      rawScore: 45,
      reasons: ['Current role is title-and-date only — no description.'],
      oneLineWhy: 'No description on the current role — a wasted prime slot.',
      needsReview: false,
    };
  }

  let score = 72;
  const wordCount = desc.split(/\s+/).length;

  if (wordCount < 30) {
    score -= 8;
    reasons.push('Description is very short for the most important role.');
  }

  const quant = countQuantifiers(desc);
  if (quant >= 3) {
    score += 6;
    reasons.push(`Multiple quantified outcomes detected (${quant}).`);
  } else if (quant === 0) {
    score -= 6;
    reasons.push('No quantified outcomes — reads as a duty list.');
  }

  const buzz = scanBuzzwords(desc);
  if (buzz.density === 'high') {
    score -= 8;
    reasons.push('Buzzword-dense description.');
  } else if (buzz.density === 'medium') {
    score -= 3;
    reasons.push('Some buzzword phrasing.');
  }

  // Structural duty-list detector
  const dutyOpeners = /(^|\n)\s*(responsible for|in charge of|tasked with|duties include|managed)\b/i;
  if (dutyOpeners.test(desc)) {
    score -= 5;
    reasons.push('Reads as a duty list ("responsible for...") rather than outcomes.');
  }

  if (judgment) {
    let unknownFields = 0;
    if (judgment.outcomeLed === true) {
      score += 6;
      reasons.push('Leads with outcomes and scope, not duties.');
    } else if (judgment.outcomeLed === false) {
      score -= 6;
      reasons.push('Leads with duties rather than outcomes.');
    } else {
      unknownFields++;
    }
    if (judgment.quantified === true) {
      score += 3;
      reasons.push('AI judge: outcomes are quantified.');
    } else if (judgment.quantified === false) {
      score -= 3;
      reasons.push('AI judge: outcomes not adequately quantified.');
    } else {
      unknownFields++;
    }
    if (judgment.conveysScope === true) {
      score += 4;
      reasons.push('Conveys scope (team size, surface area, scale).');
    } else if (judgment.conveysScope === false) {
      score -= 4;
      reasons.push('No scope signal — recruiter cannot gauge the size of the role.');
    } else {
      unknownFields++;
    }
    if (judgment.proportionate === true) {
      score += 3;
      reasons.push('Length is proportional to the role.');
    } else if (judgment.proportionate === false) {
      score -= 3;
      reasons.push('Length is not proportional to the role — too thin or too long.');
    } else {
      unknownFields++;
    }
    if (judgment.notes) reasons.push(judgment.notes);
    return {
      rawScore: clamp(score),
      reasons,
      oneLineWhy: oneLine(score, true),
      // If most of the AI booleans were missing, treat as degraded coverage.
      needsReview: unknownFields >= 3,
    };
  } else {
    reasons.push('Outcome-vs-duty assessment pending AI review.');
    return {
      rawScore: clamp(score),
      reasons,
      oneLineWhy: oneLine(score, false),
      needsReview: true,
    };
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function oneLine(score: number, hasJudge: boolean): string {
  if (!hasJudge) return 'Current role present; outcome-vs-duty pending AI review.';
  if (score >= 90) return 'Outcome-led, scoped, quantified, proportionate.';
  if (score >= 80) return 'Describes the job well but one element is missing.';
  if (score >= 70) return 'Describes the job in duties, not outcomes.';
  return 'Current-role section is doing very little for the candidate.';
}
