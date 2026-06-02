import type { Letter } from '@/lib/engine/types';

/**
 * Letter conversion table — directly from RUBRIC.md § 1.
 * The same table is used for section scores AND the composite score.
 */
interface LetterBoundary {
  letter: Letter;
  min: number;
  max: number;
}

export const LETTER_BOUNDARIES: readonly LetterBoundary[] = [
  { letter: 'A+', min: 97, max: 100 },
  { letter: 'A', min: 93, max: 96 },
  { letter: 'A-', min: 90, max: 92 },
  { letter: 'B+', min: 87, max: 89 },
  { letter: 'B', min: 83, max: 86 },
  { letter: 'B-', min: 80, max: 82 },
  { letter: 'C+', min: 77, max: 79 },
  { letter: 'C', min: 73, max: 76 },
  { letter: 'C-', min: 70, max: 72 },
  { letter: 'D', min: 60, max: 69 },
  { letter: 'F', min: 0, max: 59 },
];

/**
 * The highest adjusted score a structural-only (AI-pending, `needsReview`)
 * section may reach. Equals the top of the B+ band — structural signals alone
 * cannot honestly tell A-grade originality from clever cliché-stuffing, so the
 * grade is capped at B+ until the AI judge (B3) can lift it. See the "B+
 * ceiling" policy in `lib/engine/README.md`.
 *
 * Note: the recalibration spec referred to this as "85"; the authoritative
 * intent is the *B+ band*, whose top is 89 — using 89 lets a genuinely strong
 * structural headline read B+ in the final report (the stated goal) rather
 * than capping it down to a B.
 */
export const B_PLUS_CEILING = 89;

export function scoreToLetter(score: number): Letter {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  for (const b of LETTER_BOUNDARIES) {
    if (clamped >= b.min && clamped <= b.max) return b.letter;
  }
  // RUBRIC-ASSUMPTION: scores outside 0-100 are clamped first; this branch is unreachable.
  return 'F';
}

/**
 * The minimum score that earns the next letter up. Used by fix ranking
 * (gap-to-next-letter). For A+, returns 100 (no further upgrade possible).
 */
export function scoreToNextLetterThreshold(score: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  // Find the boundary the score is in, then return the next-higher boundary's min.
  const idx = LETTER_BOUNDARIES.findIndex((b) => clamped >= b.min && clamped <= b.max);
  if (idx <= 0) return 100; // already A+ or unreachable
  const next = LETTER_BOUNDARIES[idx - 1];
  return next ? next.min : 100;
}

/**
 * Letters in descending quality order, useful for comparisons.
 */
export const LETTER_ORDER: readonly Letter[] = LETTER_BOUNDARIES.map((b) => b.letter);

export function letterRank(letter: Letter): number {
  // 0 = best (A+), higher = worse
  return LETTER_ORDER.indexOf(letter);
}
