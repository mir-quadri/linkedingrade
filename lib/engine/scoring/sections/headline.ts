import type { ProfileData } from '@/lib/engine/types';
import type { HeadlineJudgment } from '@/lib/engine/types/judge';
import { startsWithCliche } from '../buzzwords';
import { B_PLUS_CEILING } from '../letters';

export interface HeadlineScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
  /**
   * Codex Round 4 P2 — true when the AI judge ACTUALLY raised the score
   * above the structural-only floor. `needsReview === false` alone is
   * not enough: a complete-but-harsh judgment (all booleans returned,
   * all unfavourable) clears `needsReview` but does NOT confirm any
   * above-B+ signal. Without this distinction `runScoring` would skip
   * the B+ cap and let the seniority modifier push a "judge said this
   * is bad" headline to A-/A. The cap fires when `needsReview ||
   * !judgeLifted`.
   */
  judgeLifted: boolean;
}

const MOBILE_TRUNCATION_CHARS = 70;
const MAX_HEADLINE_CHARS = 220;

/**
 * Power words that signal seniority or a concrete specialty. Each distinct
 * match adds +5 to the structural headline score, capped at +10 (two matches).
 */
const HEADLINE_POWER_WORDS: readonly string[] = [
  'leader', 'executive', 'driving', 'building', 'head of', 'vp', 'svp', 'evp',
  'founder', 'co-founder', 'cofounder', 'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo',
  'director', 'principal', 'chief', 'partner', 'transformation', 'strategy', 'growth',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Length signal: char count → +0..+15, sweet spot 120–180 chars (a developed,
 * scannable headline). Bare titles (< 40 chars) earn nothing.
 */
function headlineLengthSignal(len: number): number {
  if (len >= 120 && len <= 180) return 15;
  if (len >= 90 && len < 120) return 12;
  if (len > 180 && len <= 220) return 10;
  if (len >= 60 && len < 90) return 8;
  if (len >= 40 && len < 60) return 4;
  return 0;
}

/** Count distinct recognised power words present in the headline. */
function countPowerWords(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const w of HEADLINE_POWER_WORDS) {
    const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(w)}(?:$|[^a-z0-9])`, 'i');
    if (pattern.test(lower)) count++;
  }
  return count;
}

/**
 * Count runs of capitalised words ("Payments Technology", "Digital
 * Transformation"). A keyword-dense headline carries several; a bare title
 * carries two or three. Single-letter tokens ("I", "&") are ignored.
 */
function countCapitalizedPhrases(text: string): number {
  const matches = text.match(/[A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*)*/g) ?? [];
  return matches.filter((m) => m.replace(/[^A-Za-z]/g, '').length >= 2).length;
}

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
      judgeLifted: false,
    };
  }

  const trimmed = headline.trim();
  const len = trimmed.length;

  // Structural base: additive model (replaces the old flat "70" baseline that
  // returned a floor-stuck raw 70 for every well-formed headline regardless of
  // content). A bare title earns little; a developed, keyword-rich, pipe-
  // delimited headline climbs toward the B+ structural ceiling.
  //
  //   base 50
  //   + length signal       0..+15  (sweet spot 120–180 chars)
  //   + 2+ pipe segments       +10  (scannable, keyword-rich structure)
  //   + power words      +5 each, capped +10
  //   + keyword-rich (>3 capitalised phrases)  +5
  let score = 50;

  const lengthSignal = headlineLengthSignal(len);
  if (lengthSignal > 0) {
    score += lengthSignal;
    if (lengthSignal >= 12) reasons.push('Length is in the developed-headline sweet spot.');
  } else {
    reasons.push('Headline is very short — likely just a job title.');
  }

  const pipeCount = (trimmed.match(/\|/g) ?? []).length;
  if (pipeCount >= 2) {
    score += 10;
    reasons.push('Pipe-delimited segments — scannable, keyword-rich structure.');
  }

  const powerHits = countPowerWords(trimmed);
  if (powerHits > 0) {
    score += Math.min(powerHits, 2) * 5;
    reasons.push(
      powerHits === 1
        ? 'Uses a recognised power word (seniority / specialty signal).'
        : 'Uses recognised power words (seniority / specialty signals).',
    );
  }

  if (countCapitalizedPhrases(trimmed) > 3) {
    score += 5;
    reasons.push('Keyword-rich — several specific, capitalised phrases.');
  }

  // Structural signal: length sanity (over the hard limit)
  if (len > MAX_HEADLINE_CHARS) {
    score -= 5;
    reasons.push(`Headline exceeds the ${MAX_HEADLINE_CHARS}-char limit (${len} chars).`);
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

  // Structural ceiling: signals alone cannot exceed the B+ band — structural
  // cues can't tell A-grade originality from clever cliché-stuffing. The AI
  // judge (below) may lift above this; structural-only headlines cannot.
  score = Math.min(score, B_PLUS_CEILING);

  // Lift-only invariant (B3 Unit 2): the structural score IS the floor.
  // The AI judge may RAISE a section above its structural value (and above
  // the B+ cap, toward A) but must NEVER drop it below this floor — a
  // judge that returns harsh booleans for a structurally-decent headline
  // shouldn't be able to turn a B into a D. Snapshot the structural score
  // before applying judgment adjustments, then take `max(floor, adjusted)`
  // at the end.
  const structuralFloor = clamp(score);

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

  // Lift-only invariant: never below the structural floor when judgment
  // is present. Without judgment, the structural score IS the score —
  // no max() needed (structural == floor by definition).
  const judgeAdjusted = clamp(score);
  const rawScore = judgment
    ? Math.max(structuralFloor, judgeAdjusted)
    : judgeAdjusted;
  // Codex Round 4 P2 — `judgeLifted` is true only when the judge
  // ACTUALLY pushed above the structural floor. A complete-but-harsh
  // judgment (all booleans present, all unfavourable) clears
  // `needsReview` but does NOT confirm any above-B+ signal; without
  // this flag, runScoring would skip the B+ cap and let the
  // seniority modifier turn a "judge said this is bad" headline into
  // an A-/A grade.
  const judgeLifted = !!judgment && judgeAdjusted > structuralFloor;
  // Codex Round 2 P2: derive the summary from the FINAL rawScore, not
  // the pre-floor `score`. Otherwise a harsh judgment on a structurally
  // strong headline could surface a high grade with a "does little
  // work" narrative — the score the user sees and the sentence
  // explaining it would disagree.
  const oneLineWhy = oneLine(rawScore, !!judgment, judgment);
  return {
    rawScore,
    reasons,
    oneLineWhy,
    // No judgment, or most boolean fields missing → degraded coverage.
    needsReview: !judgment || unknownFields >= 3,
    judgeLifted,
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
