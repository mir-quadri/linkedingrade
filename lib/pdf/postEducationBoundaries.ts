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
 * treated as a header. In the Experience slice, compound labels always end
 * it; bare nouns only do when they're clearly a heading (see
 * `isBareHeadingInExperience`) — that also covers Projects/Organizations/
 * Courses between Experience and Education, not just when Education is
 * omitted.
 *
 * Applied here rather than inside parseLinkedInText.ts so the change stays
 * a small, reviewable file (the parser itself is a 75KB blob).
 */

import { AGGREGATE_DURATION_LINE, DATE_LINE } from './parseLinkedInText';

const EDUCATION_SLICE_TERMINATORS: ReadonlySet<string> = new Set([
  'Volunteer Experience',
  'Volunteer experience',
  'Projects',
  'Organizations',
  'Courses',
  'Recommendations',
]);

/**
 * Main-column sections that can follow Experience (when Education is omitted,
 * or sitting between Experience and Education). Compound labels are
 * unambiguous — nobody's employer is called "Volunteer Experience" — so
 * they always end the Experience slice.
 */
const EXPERIENCE_COMPOUND_TERMINATORS: ReadonlySet<string> = new Set([
  'Volunteer Experience',
  'Volunteer experience',
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
 * Bare-noun headings. These are plausible company names ("Projects"),
 * role titles, or description sub-headings, so they only end the
 * Experience slice when the label is NOT role-shaped and NOT followed by
 * bullet content, and no duration date line follows before the next
 * heading (see `isBareHeadingInExperience`).
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

function isExperienceTerminator(lines: string[], i: number, end: number): boolean {
  const label = lines[i]!.trim();
  if (EXPERIENCE_COMPOUND_TERMINATORS.has(label)) return true;
  if (!EXPERIENCE_BARE_TERMINATORS.has(label)) return false;
  return isBareHeadingInExperience(lines, i, end);
}

/**
 * A bare label inside the Experience slice is treated as a section heading
 * only when ALL of these hold — otherwise it is left alone (existing
 * behaviour), because a wrong clip would drop real roles:
 *   1. not role-shaped as a COMPANY line (`label / title / date (dur)` or
 *      `label / 4 years 2 months / title / date (dur)`), so an employer
 *      literally named "Projects" or "Courses" keeps its role;
 *   2. not a role TITLE (`label / date (dur)`);
 *   3. the next line isn't a bullet (a description sub-heading like
 *      "Projects" followed by "• Built X" stays in the description);
 *   4. no duration date line appears between the label and the next
 *      heading/end — if one does, the text below could be a real role, and
 *      it's ambiguous whether it's Experience or a dated project/volunteer
 *      entry. We don't guess.
 */
function isBareHeadingInExperience(lines: string[], i: number, end: number): boolean {
  const at = (k: number) => (k < end ? lines[k]!.trim() : '');
  if (DATE_LINE.test(at(i + 1))) return false; // role title
  if (DATE_LINE.test(at(i + 2))) return false; // company / title / date
  if (AGGREGATE_DURATION_LINE.test(at(i + 1))) return false; // grouped company
  if (/^[•·\-–*]/.test(at(i + 1))) return false; // description sub-heading
  for (let k = i + 1; k < end; k++) {
    const line = lines[k]!.trim();
    if (EXPERIENCE_COMPOUND_TERMINATORS.has(line)) break;
    if (DATE_LINE.test(line)) return false;
  }
  return true;
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
    for (let i = experienceIdx + 1; i < end; i++) {
      if (isExperienceTerminator(lines, i, end)) {
        lines = [...lines.slice(0, i), ...lines.slice(end)];
        if (educationIdx !== -1) educationIdx = i;
        changed = true;
        break;
      }
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
