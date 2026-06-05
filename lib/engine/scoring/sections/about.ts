import type { ProfileData } from '@/lib/engine/types';
import type { AboutJudgment } from '@/lib/engine/types/judge';
import { scanBuzzwords, startsWithCliche } from '../buzzwords';

export interface AboutScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

/** Cap on the cliché-opener penalty (raw points). See `scoreAbout`. */
export const CLICHE_OPENER_PENALTY = 5;

export function scoreAbout(
  profile: ProfileData,
  judgment: AboutJudgment | undefined,
): AboutScore {
  const about = profile.about.data;
  const reasons: string[] = [];

  if (!about || about.trim().length < 20) {
    // Distinguish a real-empty About from an extraction miss. 'low'
    // confidence covers the case where the heading was found but the
    // body text didn't parse (redesigned markup); 'missing' covers
    // the heading not being found at all. Both are uncertainty.
    const extractionMissed =
      profile.about.confidence === 'missing' ||
      profile.about.confidence === 'low';
    return {
      rawScore: extractionMissed ? 60 : 30,
      reasons: extractionMissed
        ? ['About section could not be extracted from the page.']
        : ['About section is empty or near-empty.'],
      oneLineWhy: extractionMissed
        ? 'About could not be extracted — flagged for review.'
        : 'No About section — the strongest free-text slot is unused.',
      needsReview: extractionMissed,
    };
  }

  let score = 72;
  const text = about.trim();
  const wordCount = text.split(/\s+/).length;

  // Structural signals
  if (wordCount < 60) {
    score -= 6;
    reasons.push('About is shorter than ~60 words — likely missing range or CTA.');
  } else if (wordCount > 400) {
    score -= 3;
    reasons.push('About is very long — risks losing the reader before the CTA.');
  }

  const cliche = startsWithCliche(text);
  if (cliche) {
    // Cliché-opener penalty is capped at -5 raw. A cliché opener is real
    // feedback, but on a 25%-weighted section it shouldn't single-handedly
    // tank an otherwise substantive About (the old -8 dropped a raw 72 to 64,
    // a D→F swing off one phrase).
    score -= CLICHE_OPENER_PENALTY;
    reasons.push(`Opens with cliché phrase ("${cliche}").`);
  }

  const buzz = scanBuzzwords(text);
  if (buzz.density === 'high') {
    score -= 10;
    reasons.push(`Heavy buzzword density (${buzz.hits.slice(0, 3).join(', ')}).`);
  } else if (buzz.density === 'medium') {
    score -= 4;
    reasons.push('Some buzzword phrasing — recruiters notice.');
  }

  // Lift-only invariant (B3 Unit 2): the structural score IS the floor.
  // The AI judge may RAISE a section above its structural value (and above
  // the B+ cap, toward A) but must NEVER drop it below this floor — a
  // judge that returns harsh booleans for a structurally-decent About
  // shouldn't be able to turn a B into a D. Snapshot the structural score
  // before applying judgment adjustments, then take `max(floor, adjusted)`
  // at the end.
  const structuralFloor = clamp(score);

  // AI judgment is the heart of this section. Track which booleans actually
  // landed — the proxy prompt allows fields to be omitted, so missing fields
  // must NOT be scored as confident false.
  let unknownFields = 0;
  if (judgment) {
    if (judgment.hasHook === true) {
      score += 6;
      reasons.push('Opens with a real hook in the first two lines.');
    } else if (judgment.hasHook === false) {
      score -= 6;
      reasons.push('No real hook in the first two lines.');
    } else {
      unknownFields++;
    }
    if (judgment.hasRange === true) {
      score += 5;
      reasons.push('Conveys range — what the person does, has done, is known for.');
    } else if (judgment.hasRange === false) {
      score -= 5;
      reasons.push('Missing range — reader does not get what the person is known for.');
    } else {
      unknownFields++;
    }
    if (judgment.hasCTA === true) {
      score += 4;
      reasons.push('Clear "what next" — open to roles, contactable, building toward something.');
    } else if (judgment.hasCTA === false) {
      score -= 4;
      reasons.push('No clear call-to-action.');
    } else {
      unknownFields++;
    }
    if (judgment.voiceIsHuman === true) {
      score += 6;
      reasons.push('Voice reads as a human, not a template.');
    } else if (judgment.voiceIsHuman === false) {
      score -= 8;
      reasons.push('Voice reads as machine-generated or generic.');
    } else {
      unknownFields++;
    }
    if (judgment.notes) reasons.push(judgment.notes);
  } else {
    reasons.push('Hook/range/CTA assessment pending AI review.');
  }

  // Lift-only invariant: never below the structural floor when judgment
  // is present. Without judgment, the structural score IS the score —
  // no max() needed (structural == floor by definition).
  const rawScore = judgment
    ? Math.max(structuralFloor, clamp(score))
    : clamp(score);
  return {
    rawScore,
    reasons,
    // Codex Round 2 P2: derive the summary from the FINAL rawScore, not
    // the pre-floor `score`. A harsh judgment on a structurally strong
    // About would otherwise surface a B/A grade with a "needs work"
    // narrative — score and explanation disagreeing.
    oneLineWhy: oneLine(rawScore, !!judgment, judgment),
    // No judgment, or most of the AI booleans missing → flag degraded coverage.
    needsReview: !judgment || unknownFields >= 3,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function oneLine(score: number, hasJudge: boolean, j?: AboutJudgment): string {
  if (!hasJudge) return 'About present; hook/range/CTA pending AI review.';
  if (score >= 90) return 'Hook, range, and CTA — all present in a recognisably human voice.';
  if (score >= 80) return 'Solid About with one of the three jobs underdone.';
  if (score >= 70) return 'Generic — does one job, fails the other two.';
  if (j?.voiceIsHuman === false) return 'Reads as machine-generated filler.';
  return 'About is empty space dressed up as text.';
}
