/**
 * Deterministic buzzword detector. The AI judge produces a richer judgment;
 * this is the structural fallback the scoring engine can lean on when the
 * judge is unavailable, and a useful signal even when it is.
 *
 * RUBRIC-ASSUMPTION: this list is informed by the rubric's named offenders
 * ("results-driven", "passionate", "synergy", "thought leader",
 * "scalable solutions") plus common adjacent ChatGPT-default phrases.
 * It is not exhaustive — the AI judge catches the rest.
 */
export const BUZZWORDS: readonly string[] = [
  'results-driven', 'results driven',
  'passionate about',
  'synergy', 'synergies',
  'thought leader', 'thought leadership',
  'scalable solutions',
  'innovative solutions',
  'best-in-class', 'best in class',
  'world-class', 'world class',
  'go-getter',
  'team player',
  'detail-oriented', 'detail oriented',
  'self-starter',
  'dynamic professional',
  'seasoned professional',
  'driven professional',
  'proven track record',
  'leverage', 'leveraging',
  'value add', 'value-add',
  'cutting edge', 'cutting-edge',
  'paradigm shift',
  'helping companies',
  'helping people',
  'change the world',
  'move the needle',
  'rockstar', 'ninja', 'guru',
  'next-level', 'next level',
];

export const CLICHE_OPENERS: readonly string[] = [
  'helping companies',
  'helping people',
  'helping organizations',
  'passionate about',
  'results-driven',
  'driven professional',
  'seasoned professional',
  'experienced professional',
  'i am a',
];

export interface BuzzwordScan {
  total: number;
  density: 'low' | 'medium' | 'high';
  hits: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest-first alternation so overlapping variants don't double-count:
// "leveraging" matches before "leverage", "synergies" before "synergy", etc.
// The regex engine consumes the matched characters, so the shorter variant
// can't separately fire on the same span.
const BUZZWORD_PATTERN = new RegExp(
  `(?:${[...BUZZWORDS].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})`,
  'gi',
);

export function scanBuzzwords(text: string | null | undefined): BuzzwordScan {
  if (!text) return { total: 0, density: 'low', hits: [] };
  const lower = text.toLowerCase();
  const matches = lower.match(BUZZWORD_PATTERN) ?? [];
  // hits is the unique-phrase list used for display; total counts occurrences.
  const hits = Array.from(new Set(matches));
  // Density: per 100 words.
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const per100 = wordCount > 0 ? (matches.length / wordCount) * 100 : 0;
  let density: 'low' | 'medium' | 'high' = 'low';
  if (per100 >= 3) density = 'high';
  else if (per100 >= 1) density = 'medium';
  return { total: matches.length, density, hits };
}

export function startsWithCliche(text: string | null | undefined): string | null {
  if (!text) return null;
  const opening = text.trim().slice(0, 80).toLowerCase();
  for (const c of CLICHE_OPENERS) {
    if (opening.startsWith(c)) return c;
  }
  return null;
}

/**
 * Count quantification signals (numbers, percentages, currency, scale words).
 * Used to detect outcome-led vs. duty-list experience descriptions.
 */
export function countQuantifiers(text: string | null | undefined): number {
  if (!text) return 0;
  const patterns: RegExp[] = [
    /\b\d+%/g, // 35%
    /\$\s?\d/g, // $1M, $200k
    /\b\d+(\.\d+)?\s?(k|m|b|million|billion|thousand)\b/gi,
    /\b\d{2,}\b/g, // any 2+ digit number
    /\bgrew\b/gi,
    /\bincreased\b/gi,
    /\breduced\b/gi,
    /\blaunched\b/gi,
    /\bshipped\b/gi,
    /\bdelivered\b/gi,
  ];
  let count = 0;
  for (const p of patterns) {
    const m = text.match(p);
    if (m) count += m.length;
  }
  return count;
}
