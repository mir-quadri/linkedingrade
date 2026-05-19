import type { ProfileData, SeniorityTier } from '@/lib/engine/types';

interface TierInference {
  tier: SeniorityTier;
  modifier: number; // points subtracted from raw scores before lettering
  assumed: boolean; // true when defaulting to T2
  rationale: string;
}

const T1_KEYWORDS = [
  'analyst', 'associate', 'junior', 'jr', 'jr.',
  'coordinator', 'assistant', 'intern', 'trainee',
  'graduate', 'apprentice', 'fellow',
];

const T2_KEYWORDS = [
  'manager', 'senior', 'sr', 'sr.', 'lead', 'specialist',
  'engineer ii', 'engineer iii', 'consultant', 'designer',
];

/**
 * Unambiguous T3 signals — when one of these fires, leadership is the
 * strongest reading and the tier resolves to T3 outright (subject to the
 * T3+T1 reconciliation path below).
 */
const T3_UNAMBIGUOUS_KEYWORDS = [
  'director', 'vp', 'vice president', 'head of',
  'principal', 'partner', 'chief',
  'cto', 'ceo', 'cfo', 'coo', 'cmo', 'cpo',
  'founder', 'co-founder', 'cofounder',
  'staff engineer', 'distinguished',
  // Senior-leadership signals previously missing from the list.
  // "Transformation Leader" was scoring T1 because none of these fired.
  // Bare 'gm' is intentionally NOT here — it fires on "Software Engineer
  // at GM" (General Motors) and any other headline mentioning the
  // company acronym. The verbose 'general manager' covers the role.
  'svp', 'evp',
  'general manager', 'managing director',
];

/**
 * Ambiguous T3 signals — words that often denote senior leadership
 * ("Transformation Leader", "Head of Data", "Executive Producer",
 * "President of XYZ") but can equally mean mid-level ("Team Leader",
 * "Account Executive") or non-corporate ("Class President", "Student
 * Body President", "John Smith, MD"). Without a stronger T3 signal in
 * the same string we defer to tenure rather than applying the full -7
 * modifier.
 *
 * 'lead' stays in T2 because it's almost always mid-level in titles
 * ("Tech Lead", "Squad Lead"); it isn't repeated here.
 */
const T3_AMBIGUOUS_KEYWORDS = [
  'leader', 'head', 'executive', 'md', 'president',
];

const T3_KEYWORDS = [...T3_UNAMBIGUOUS_KEYWORDS, ...T3_AMBIGUOUS_KEYWORDS];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-term match: the keyword has to sit between non-alphanumeric chars
 * (or start/end of string). Plain substring matching let "intern" hit
 * "international" and "lead" hit "leadership", which mis-classified the
 * tier and shifted every adjusted section score.
 */
function matches(haystack: string, needles: string[]): string | null {
  const lower = haystack.toLowerCase();
  for (const n of needles) {
    const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(n)}(?:$|[^a-z0-9])`, 'i');
    if (pattern.test(lower)) return n;
  }
  return null;
}

/**
 * Parse a duration string like "5 yrs 2 mos" into total years (decimal).
 * LinkedIn surfaces this as "Full-time · 5 yrs 2 mos" or similar.
 */
function parseYears(durationText: string | null): number | null {
  if (!durationText) return null;
  const yrsMatch = durationText.match(/(\d+)\s*yr/i);
  const mosMatch = durationText.match(/(\d+)\s*mo/i);
  const years = yrsMatch?.[1] ? parseInt(yrsMatch[1], 10) : 0;
  const months = mosMatch?.[1] ? parseInt(mosMatch[1], 10) : 0;
  if (years === 0 && months === 0) return null;
  return years + months / 12;
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/**
 * Parse one endpoint of a LinkedIn date range to "absolute months"
 * (year * 12 + monthIndex). When the month isn't given, assume January
 * for a start endpoint and December for an end endpoint — this keeps the
 * inclusive-year semantics (a range "2018 - 2022" still reads as 5
 * calendar years) without over-inflating short cross-year ranges (a
 * range "Dec 2025 - Jan 2026" now reads as 2 months, not 2 years).
 */
function parseEndpoint(text: string, isEnd: boolean): number | null {
  const lower = text.toLowerCase();
  if (isEnd && /\b(present|current)\b/.test(lower)) {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  }
  const monthYear = lower.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+((?:19|20)\d{2})\b/,
  );
  if (monthYear) {
    const m = MONTH_NAMES.indexOf(monthYear[1]!.slice(0, 3));
    const year = parseInt(monthYear[2]!, 10);
    if (m >= 0 && !Number.isNaN(year)) return year * 12 + m;
  }
  const yearOnly = lower.match(/\b((?:19|20)\d{2})\b/);
  if (yearOnly) {
    const year = parseInt(yearOnly[1]!, 10);
    if (!Number.isNaN(year)) return year * 12 + (isEnd ? 11 : 0);
  }
  return null;
}

/**
 * Parse a date range like "Jan 2018 - Dec 2020" or "2020 - Present" into
 * a [startMonths, endMonths] tuple (absolute months). Best-effort; returns
 * null when parsing fails.
 */
function parseDateInterval(dates: string | null): [number, number] | null {
  if (!dates) return null;
  // Require whitespace around the separator so we don't split inside
  // hyphenated tokens. LinkedIn often prepends an employment type like
  // "Full-time · Jan 2020 - Present"; splitting at the first hyphen used
  // to land on "Full-time" and lose the entire date range. Date ranges
  // always use a spaced en/em dash or hyphen between the two date strings.
  const split = dates.match(/^(.+?)\s+[–—\-]\s+(.+)$/);
  let startText: string;
  let endText: string;
  if (split) {
    startText = split[1]!;
    endText = split[2]!;
  } else {
    startText = dates;
    endText = dates;
  }
  const start = parseEndpoint(startText, false);
  const end = parseEndpoint(endText, true);
  if (start === null || end === null || end < start) return null;
  return [start, end];
}

/**
 * Sum non-overlapping months across a set of [start, end] month intervals
 * and convert to fractional years. LinkedIn experience commonly contains
 * overlapping or nested entries (concurrent roles, parent/child positions
 * at the same company); a raw sum inflates total tenure and can push
 * users into stricter tiers (T2/T3) artificially.
 */
function nonOverlappingYears(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let totalMonths = 0;
  let [s, e] = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const [ns, ne] = sorted[i]!;
    if (ns <= e) {
      e = Math.max(e, ne);
    } else {
      // Inclusive month span: a [Jan 2018, Dec 2018] interval is 12 months.
      totalMonths += e - s + 1;
      [s, e] = [ns, ne];
    }
  }
  totalMonths += e - s + 1;
  return totalMonths / 12;
}

/**
 * Estimate total career years from the extracted experience history.
 * Prefers date-interval parsing (handles overlapping roles correctly);
 * falls back to the longest single duration when no dates are parseable,
 * which is conservative (underestimates serial careers but never inflates).
 *
 * RUBRIC-ASSUMPTION: when the history isn't fully extracted we
 * underestimate — so the keyword signal carries more weight than the
 * years signal.
 */
function totalCareerYears(profile: ProfileData): number | null {
  const entries = profile.experienceHistory.data;
  if (!entries || entries.length === 0) return null;

  const intervals: Array<[number, number]> = [];
  let longestDuration = 0;
  let anyDuration = false;
  for (const e of entries) {
    const interval = parseDateInterval(e.dates);
    if (interval) intervals.push(interval);
    const y = parseYears(e.durationText);
    if (y !== null) {
      anyDuration = true;
      if (y > longestDuration) longestDuration = y;
    }
  }

  if (intervals.length > 0) return nonOverlappingYears(intervals);
  return anyDuration ? longestDuration : null;
}

export function inferSeniority(profile: ProfileData): TierInference {
  const title = profile.currentExperience.data?.title ?? '';
  const headline = profile.headline.data ?? '';
  const combined = `${title} ${headline}`;

  const t3 = matches(combined, T3_KEYWORDS);
  const t3Unambiguous = matches(combined, T3_UNAMBIGUOUS_KEYWORDS);
  const t1 = matches(combined, T1_KEYWORDS);
  const t2 = matches(combined, T2_KEYWORDS);
  const years = totalCareerYears(profile);

  // Conflict reconciliation: if a leadership keyword AND an early-career
  // keyword both fire (e.g. "Executive Assistant to CEO" matches "ceo" and
  // "assistant"), don't auto-T3. Defer to the years signal: an assistant to
  // a CEO has T1 tenure, and the global -7 modifier would otherwise depress
  // every section grade for what is structurally a junior role.
  if (t3 && t1) {
    if (years !== null && years >= 10) {
      return {
        tier: 'T3',
        modifier: -7,
        assumed: false,
        rationale: `Both senior ("${t3.trim()}") and early-career ("${t1.trim()}") keywords; ~${years.toFixed(1)} yrs of tenure resolves to senior`,
      };
    }
    if (years !== null && years >= 5) {
      return {
        tier: 'T2',
        modifier: -3,
        assumed: false,
        rationale: `Both senior ("${t3.trim()}") and early-career ("${t1.trim()}") keywords; ~${years.toFixed(1)} yrs of tenure resolves to mid-level`,
      };
    }
    return {
      tier: 'T1',
      modifier: 0,
      assumed: false,
      rationale: `Both senior ("${t3.trim()}") and early-career ("${t1.trim()}") keywords with low/unknown tenure — treated as early-career`,
    };
  }

  // Ambiguous-T3 path: only an ambiguous senior word fired ('leader',
  // 'head', 'executive', 'md'), with no stronger T3 signal in the
  // string. These match real senior titles ("Transformation Leader",
  // "Head of Data", "Executive Producer") but also mid-level ones
  // ("Team Leader", "Account Executive"). Defer to tenure rather than
  // apply the full -7 modifier from a single weak word — mirrors the
  // T3+T1 reconciliation shape, minus the explicit junior signal.
  if (t3 && !t3Unambiguous) {
    if (years !== null && years >= 10) {
      return {
        tier: 'T3',
        modifier: -7,
        assumed: false,
        rationale: `Ambiguous senior keyword ("${t3.trim()}") + ~${years.toFixed(1)} yrs of tenure resolves to senior`,
      };
    }
    if (years !== null && years >= 5) {
      return {
        tier: 'T2',
        modifier: -3,
        assumed: false,
        rationale: `Ambiguous senior keyword ("${t3.trim()}") + ~${years.toFixed(1)} yrs of tenure resolves to mid-level`,
      };
    }
    // Low or unknown tenure: if an explicit T2 keyword also fired
    // ("Executive Manager", "Head Designer"), the concrete mid-level
    // signal wins — previously these were getting demoted to T1 by the
    // ambiguous-low-tenure path even though "manager"/"designer" is a
    // clean mid-level read.
    if (t2) {
      return {
        tier: 'T2',
        modifier: -3,
        assumed: false,
        rationale: `Mid-level keyword ("${t2.trim()}") with ambiguous senior word ("${t3.trim()}") — treated as mid-level`,
      };
    }
    if (years !== null) {
      return {
        tier: 'T1',
        modifier: 0,
        assumed: false,
        rationale: `Ambiguous senior keyword ("${t3.trim()}") with ~${years.toFixed(1)} yrs of tenure — treated as early-career`,
      };
    }
    // No tenure signal — lean mid-level. We have *some* senior wording
    // but no years to confirm it; T2 is the conservative read between
    // "auto-promote to T3" and "demote to T1 with no evidence".
    return {
      tier: 'T2',
      modifier: -3,
      assumed: false,
      rationale: `Ambiguous senior keyword ("${t3.trim()}") with unknown tenure — treated as mid-level`,
    };
  }

  // T3 keywords win outright — unambiguous leadership titles are the
  // strongest signal we have.
  if (t3) {
    return {
      tier: 'T3',
      modifier: -7,
      assumed: false,
      rationale: `Senior/leadership keyword in title or headline ("${t3.trim()}")`,
    };
  }

  // T1 keyword + low years → T1
  if (t1 && (years === null || years <= 4)) {
    return {
      tier: 'T1',
      modifier: 0,
      assumed: false,
      rationale: `Early-career keyword ("${t1.trim()}")` + (years !== null ? `, ~${years.toFixed(1)} yrs total` : ''),
    };
  }

  // T2 keyword OR mid-range years → T2
  if (t2 || (years !== null && years >= 5 && years < 10)) {
    return {
      tier: 'T2',
      modifier: -3,
      assumed: false,
      rationale: t2
        ? `Mid-level keyword ("${t2.trim()}")`
        : `~${years!.toFixed(1)} yrs total experience`,
    };
  }

  // Years signal alone for T3 (10+)
  if (years !== null && years >= 10) {
    return {
      tier: 'T3',
      modifier: -7,
      assumed: false,
      rationale: `~${years.toFixed(1)} yrs total experience`,
    };
  }

  // Years signal alone for T1 (0-4)
  if (years !== null && years <= 4) {
    return {
      tier: 'T1',
      modifier: 0,
      assumed: false,
      rationale: `~${years.toFixed(1)} yrs total experience`,
    };
  }

  // Default: T2, flagged as assumed.
  return {
    tier: 'T2',
    modifier: -3,
    assumed: true,
    rationale: 'Could not confidently infer seniority — defaulting to mid-level (T2)',
  };
}

export function applySeniorityModifier(rawScore: number, modifier: number): number {
  return Math.max(0, Math.min(100, rawScore + modifier));
}

export const TIER_LABEL: Record<SeniorityTier, string> = {
  T1: 'Early career',
  T2: 'Mid-level',
  T3: 'Senior / Leadership',
};
