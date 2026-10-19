/**
 * Clip post-Education main-column sections out of a LinkedIn "Save to PDF"
 * text dump so they cannot be parsed as schools or phantom jobs.
 *
 * Continues the #27 parser stream: Education was the last recognised
 * header, so Volunteer Experience / Projects / Organizations / Courses /
 * Recommendations ran into the Education slice. When Education was omitted,
 * volunteer date-lines became phantom Experience jobs.
 *
 * These labels are TERMINATORS only — we do not parse their content (no new
 * product feature). Clip is order-aware (Education only after Experience /
 * Summary) so a Top Skill literally named "Education" or "Projects" cannot
 * become the clip origin, and a company literally named "Projects" is not
 * treated as a header. In the Experience slice, a sibling label only ends it
 * when it's clearly a heading and not a role or a description sub-heading
 * (see `firstExperienceHeading`). That also covers Projects/Organizations/
 * Courses between Experience and Education, not just when Education is
 * omitted. The pass is linear in the number of lines (untrusted input).
 *
 * Applied here rather than inside parseLinkedInText.ts so the change stays
 * a small, reviewable file (the parser itself is a 75KB blob).
 */

import { AGGREGATE_DURATION_LINE, DATE_ENDPOINT, DATE_LINE } from './parseLinkedInText';

const EDUCATION_SLICE_TERMINATORS: ReadonlySet<string> = new Set([
  'Volunteer Experience',
  'Volunteer experience',
  'Projects',
  'Organizations',
  'Courses',
  'Recommendations',
]);

/**
 * "Volunteer Experience" can't be an employer name, but its real entries
 * carry `(duration)` date lines just like roles. So it gets only the
 * role-shape and next-line-bullet guards, never the date scan.
 */
const EXPERIENCE_VOLUNTEER_TERMINATORS: ReadonlySet<string> = new Set([
  'Volunteer Experience',
  'Volunteer experience',
]);

/**
 * Compound labels that are unlikely as employer names but do show up as
 * description sub-headings ("Licenses & Certifications" / "• PMP"). They
 * get the full guard: role-shape, next-line bullet, and the date scan.
 */
const EXPERIENCE_COMPOUND_TERMINATORS: ReadonlySet<string> = new Set([
  'Recommendations',
  'Honors-Awards',
  'Honors and Awards',
  'Honors and awards',
  'Honors & Awards',
  'Honors & awards',
  'Licenses & Certifications',
  'Licenses & certifications',
  'Licenses and Certifications',
  'Licenses and certifications',
]);

/**
 * Bare nouns. They're plausible company names ("Projects"), role titles, or
 * description sub-headings, so on top of the full guard they also need an
 * entry-shaped line just below (`looksLikeSectionEntry`).
 */
const EXPERIENCE_BARE_TERMINATORS: ReadonlySet<string> = new Set([
  'Projects',
  'Organizations',
  'Courses',
  'Honors',
  'Certifications',
  'Languages',
  'Volunteer',
  'Volunteering',
]);

/** How many lines below a bare label we look for an entry-shaped line. */
const ENTRY_LOOKAHEAD = 3;

const PLAIN_DATE_RANGE = new RegExp(
  `^(?:${DATE_ENDPOINT})(?:\\s*[-–—]\\s*(?:${DATE_ENDPOINT}))?$`,
  'i',
);
const ENTRY_PREFIX = /^(?:Issued by|Issued|Associated with)\b/i;
const PROFICIENCY =
  /^(?:Native or bilingual|Full professional|Professional working|Limited working|Elementary)\b.*proficiency$/i;
const BULLET = /^[•·\-–*]/;

/**
 * A line that reads like the first lines of a section entry (project name,
 * course or award title, language, issuer or date), not description prose.
 * Prose ends in sentence punctuation or runs long.
 */
function looksLikeSectionEntry(line: string): boolean {
  if (!line) return false;
  if (PLAIN_DATE_RANGE.test(line) || ENTRY_PREFIX.test(line) || PROFICIENCY.test(line)) {
    return true;
  }
  if (line.length > 60 || /[.!?:;,]$/.test(line) || BULLET.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > 8 || !/^[A-Z0-9]/.test(words[0]!)) return false;
  // Title-case: every word of 4+ letters starts uppercase/digit; short
  // connectives ("of", "the", "and") are allowed in lowercase.
  return words.every((w) => w.length < 4 || /^[A-Z0-9&"'(]/.test(w));
}

type TerminatorKind = 'volunteer' | 'compound' | 'bare';

function terminatorKind(label: string): TerminatorKind | null {
  if (EXPERIENCE_VOLUNTEER_TERMINATORS.has(label)) return 'volunteer';
  if (EXPERIENCE_COMPOUND_TERMINATORS.has(label)) return 'compound';
  if (EXPERIENCE_BARE_TERMINATORS.has(label)) return 'bare';
  return null;
}

/**
 * Index of the first confirmed sibling heading in `(from, end)`, or -1.
 *
 * A candidate label at i is a heading only when (otherwise it's left alone,
 * because a wrong clip would drop real roles):
 *   1. not role-shaped as a COMPANY line (`label / title / date (dur)` or
 *      `label / 4 years 2 months / title / …`) or a role TITLE
 *      (`label / date (dur)`), so an employer named "Projects" keeps its role;
 *   2. the next line isn't a bullet (description sub-heading);
 *   3. (compound + bare) no duration date line before the next CONFIRMED
 *      heading or the end; if one exists, the text below could be a real
 *      role and we don't guess;
 *   4. (bare only) an entry-shaped line within the next ENTRY_LOOKAHEAD lines.
 *
 * O(n): one backward pass. Walking from the end, `nextDate` is the closest
 * duration date line below i and `nextHeading` the closest confirmed heading
 * below i. Rule 3 becomes `nextDate === -1 || nextDate > nextHeading`
 * (when nextHeading exists), with no rescan per candidate. Each line costs a
 * constant number of anchored regex tests on that line or a fixed number of
 * neighbours.
 */
function firstExperienceHeading(lines: string[], from: number, end: number): number {
  const trimmed = (k: number) => (k < end ? lines[k]!.trim() : '');
  let nextDate = -1;
  let nextHeading = -1;
  for (let i = end - 1; i > from; i--) {
    const label = lines[i]!.trim();
    const kind = terminatorKind(label);
    if (kind !== null && isHeading(kind, i)) nextHeading = i;
    if (DATE_LINE.test(label)) nextDate = i;
  }
  return nextHeading;

  function isHeading(kind: TerminatorKind, i: number): boolean {
    const n1 = trimmed(i + 1);
    if (DATE_LINE.test(n1)) return false; // role title
    if (DATE_LINE.test(trimmed(i + 2))) return false; // company / title / date
    if (AGGREGATE_DURATION_LINE.test(n1)) return false; // grouped company
    if (BULLET.test(n1)) return false; // description sub-heading
    if (kind === 'volunteer') return true;
    if (nextDate !== -1 && (nextHeading === -1 || nextDate < nextHeading)) return false;
    if (kind === 'compound') return true;
    for (let k = i + 1; k <= i + ENTRY_LOOKAHEAD && k < end; k++) {
      if (looksLikeSectionEntry(trimmed(k))) return true;
    }
    return false;
  }
}

function indexOfExact(lines: string[], label: string, from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (lines[i]!.trim() === label) return i;
  }
  return -1;
}

/**
 * Drop Volunteer Experience / Projects / Organizations / Courses /
 * Recommendations that appear AFTER Education (or, if Education is omitted,
 * drop compound Volunteer/Recommendations after Experience).
 *
 * Must not clip at the first "Volunteer Experience" in the document — a
 * rare contact-column occurrence would drop Summary / Experience / Education.
 */
export function clipPostEducationText(raw: string): string {
  let lines = raw.split(/\r?\n/);

  // Canonical LinkedIn PDF order: Summary → Experience → Education →
  // post-Education siblings. Search Education only after Experience (or
  // after Summary if Experience is missing) so a sidebar item named
  // "Education" cannot become the clip origin.
  const summaryIdx = indexOfExact(lines, 'Summary', 0);
  const experienceFrom = summaryIdx === -1 ? 0 : summaryIdx + 1;
  const experienceIdx = indexOfExact(lines, 'Experience', experienceFrom);
  const educationFrom = experienceIdx !== -1 ? experienceIdx + 1 : experienceFrom;
  let educationIdx = indexOfExact(lines, 'Education', educationFrom);
  let changed = false;

  // 1. End the Experience slice at the first sibling section heading,
  //    whether or not Education follows. With Education, drop only the
  //    lines between that heading and Education so Education still parses.
  //    Searched only after Experience, so contact-column labels (which sit
  //    above Summary/Experience) can never become the clip origin.
  if (experienceIdx !== -1) {
    const end = educationIdx !== -1 ? educationIdx : lines.length;
    const i = firstExperienceHeading(lines, experienceIdx, end);
    if (i !== -1) {
      lines = [...lines.slice(0, i), ...lines.slice(end)];
      if (educationIdx !== -1) educationIdx = i;
      changed = true;
    }
  }

  // 2. Clip post-Education siblings (unchanged from #28).
  if (educationIdx !== -1) {
    for (let i = educationIdx + 1; i < lines.length; i++) {
      if (EDUCATION_SLICE_TERMINATORS.has(lines[i]!.trim())) {
        return lines.slice(0, i).join('\n');
      }
    }
  }

  return changed ? lines.join('\n') : raw;
}
