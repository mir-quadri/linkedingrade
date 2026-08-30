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
 * treated as a header (bare nouns are education-clip-only).
 *
 * Applied here rather than inside parseLinkedInText.ts so the change stays
 * a small, reviewable file (the parser itself is a 75KB blob).
 */

const EDUCATION_SLICE_TERMINATORS: ReadonlySet<string> = new Set([
  'Volunteer Experience',
  'Volunteer experience',
  'Projects',
  'Organizations',
  'Courses',
  'Recommendations',
]);

/**
 * Experience is usually bounded by Education. When Education is omitted the
 * slice runs to EOF. Clip at the compound labels only — not at bare
 * `Projects` / `Organizations` / `Courses`, which are plausible company
 * names and would truncate a real role.
 */
const EXPERIENCE_SLICE_TERMINATORS: ReadonlySet<string> = new Set([
  'Volunteer Experience',
  'Volunteer experience',
  'Recommendations',
]);

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
  const lines = raw.split(/\r?\n/);

  // Canonical LinkedIn PDF order: Summary → Experience → Education →
  // post-Education siblings. Search Education only after Education (or
  // after Summary if Experience is missing) so a sidebar item named
  // "Education" cannot become the clip origin.
  const summaryIdx = indexOfExact(lines, 'Summary', 0);
  const experienceFrom = summaryIdx === -1 ? 0 : summaryIdx + 1;
  const experienceIdx = indexOfExact(lines, 'Experience', experienceFrom);
  const educationFrom = experienceIdx !== -1 ? experienceIdx + 1 : experienceFrom;
  const educationIdx = indexOfExact(lines, 'Education', educationFrom);

  if (educationIdx !== -1) {
    for (let i = educationIdx + 1; i < lines.length; i++) {
      if (EDUCATION_SLICE_TERMINATORS.has(lines[i]!.trim())) {
        return lines.slice(0, i).join('\n');
      }
    }
    return raw;
  }

  if (experienceIdx !== -1) {
    for (let i = experienceIdx + 1; i < lines.length; i++) {
      if (EXPERIENCE_SLICE_TERMINATORS.has(lines[i]!.trim())) {
        return lines.slice(0, i).join('\n');
      }
    }
  }

  return raw;
}
