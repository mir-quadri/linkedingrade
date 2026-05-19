import type { ProfileData } from '@/lib/engine/types';
import type { HeadlineJudgment } from '@/lib/engine/types/judge';
import { startsWithCliche } from '../buzzwords';

export interface HeadlineScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

const MOBILE_TRUNCATION_CHARS = 70;
const MAX_HEADLINE_CHARS = 220;

export function scoreHeadline(
  profile: ProfileData,
  judgment: HeadlineJudgment | undefined,
): HeadlineScore {
  const headline = profile.headline.data;
  const reasons: string[] = [];

  if (!headline || headline.trim().length === 0) {
    // Distinguish a confirmed-empty headline from an extraction miss.
    // Selector drift shouldn't read as confirmed-empty (30) — that
    // disproportionately drags the composite for a high-weight section.
    const extractionMissed =
      profile.headline.confidence === 'missing' ||
      profile.headline.confidence === 'low';
    return {
      rawScore: extractionMissed ? 60 : 30,
      reasons: [
        extractionMissed
          ? 'Headline could not be extracted from the page.'
          : 'No headline detected.',
      ],
      oneLineWhy: extractionMissed
        ? 'Headline could not be extracted — flagged for review.'
        : 'Headline is missing — recruiters see nothing under your name.',
      needsReview: extractionMissed,
    };
  }

  const trimmed = headline.trim();
  const len = trimmed.length;
  let score = 70; // start from "C" baseline; signals push up or down

  // Structural signal: length sanity
  if (len > MAX_HEADLINE_CHARS) {
    score -= 5;
    reasons.push(`Headline exceeds the ${MAX_HEADLINE_CHARS}-char limit (${len} chars).`);
  } else if (len < 30) {
    score -= 8;
    reasons.push('Headline is very short — likely just a job title.');
  }

  // Structural signal: cliché opener (deterministic)
  const cliche = startsWithCliche(trimmed);
  if (cliche) {
    score -= 10;
    reasons.push(`Opens with cliché phrase ("${cliche}").`);
  }

  // Structural signal: mobile truncation point
  const beforeCut = trimmed.slice(0, MOBILE_TRUNCATION_CHARS);
  const hasSeparatorBeforeCut = /[|·•—\-,]/.test(beforeCut);
  if (!hasSeparatorBeforeCut && len > MOBILE_TRUNCATION_CHARS) {
    score -= 4;
    reasons.push('First 70 characters lack a clear claim or separator (mobile truncation risk).');
  }

  // Track how many of the AI boolean fields actually came back. The proxy
  // prompt allows fields to be omitted, so a partial object (e.g. notes-only)
  // shouldn't be treated as a confident "all false" judgment — that misclassifies
  // missing AI evidence as low quality.
  let unknownFields = 0;
  if (judgment) {
    if (judgment.hasIdentity === true) {
      score += 5;
      reasons.push('States a credible identity.');
    } else if (judgment.hasIdentity === false) {
      score -= 6;
      reasons.push('No clear identity or role stated.');
    } else {
      unknownFields++;
    }
    if (judgment.hasDomain === true) {
      score += 5;
      reasons.push('Names a specific domain or specialty.');
    } else if (judgment.hasDomain === false) {
      score -= 5;
      reasons.push('Missing domain or specialty.');
    } else {
      unknownFields++;
    }
    if (judgment.hasCredibleSpecific === true) {
      score += 6;
      reasons.push('Includes a credible specific (numbers, named work, proof).');
    } else if (judgment.hasCredibleSpecific === false) {
      score -= 4;
      reasons.push('No credible specific — headline lacks concrete proof.');
    } else {
      unknownFields++;
    }
    if (judgment.hasCliche === true && !cliche) {
      score -= 6;
      reasons.push('Reads as a cliché or AI-default phrasing.');
    } else if (judgment.hasCliche === undefined) {
      unknownFields++;
    }
    if (judgment.mobileSafe === true) {
      score += 3;
      reasons.push('Essential claim survives mobile truncation.');
    } else if (judgment.mobileSafe === false && len > MOBILE_TRUNCATION_CHARS) {
      score -= 4;
      reasons.push('Essential claim is past the mobile cut-off.');
    } else if (judgment.mobileSafe === undefined) {
      unknownFields++;
    }
    if (judgment.notes) reasons.push(judgment.notes);
  }

  const oneLineWhy = oneLine(score, !!judgment, judgment);
  return {
    rawScore: clamp(score),
    reasons,
    oneLineWhy,
    // No judgment, or most boolean fields missing → degraded coverage.
    needsReview: !judgment || unknownFields >= 3,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function oneLine(score: number, hasJudge: boolean, j?: HeadlineJudgment): string {
  if (!hasJudge) return 'Structural signals scored; nuance pending AI review.';
  if (score >= 90) return 'Identity, domain, and a credible specific — all before the mobile cut.';
  if (score >= 80) return 'Solid headline, but one clear gap to close.';
  if (score >= 70) return 'Reads as a job title and little else.';
  if (j?.hasCliche) return 'Cliché opener and no concrete claim.';
  return 'Headline does little work — most of the slot is wasted.';
}
