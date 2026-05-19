import type {
  ProfileData,
  ExperienceEntry,
  EducationItem,
  CertificationItem,
  SectionExtraction,
} from '@/lib/engine/types';

const SECTION_HEADERS = [
  'Contact',
  'Top Skills',
  'Languages',
  'Certifications',
  'Summary',
  'Experience',
  'Education',
] as const;
type SectionHeader = (typeof SECTION_HEADERS)[number];

// Sidebar sections sit above the identity block in a LinkedIn PDF. Any of
// them can be the last one before the name appears (Certifications is the
// canonical trailing header, but the Certifications section is optional).
const SIDEBAR_HEADERS: ReadonlySet<SectionHeader> = new Set([
  'Contact',
  'Top Skills',
  'Languages',
  'Certifications',
]);

interface HeaderIndex {
  header: SectionHeader;
  line: number;
}

const PAGE_FOOTER = /^\s*Page\s+\d+\s+of\s+\d+\s*$/i;

// Date line: "<start> - <end> (<duration>)".
// Endpoints must be a 4-digit calendar year (optionally preceded by a month
// name) or "Present" / "Current". This stops accomplishment bullets such as
// "• Reduced latency - improved p95 (35%)" from being mistaken for a role's
// date line, which would otherwise inject phantom entries and truncate the
// real role's description.
const MONTH_NAME =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_ENDPOINT = `(?:${MONTH_NAME}\\s+)?(?:19|20)\\d{2}|Present|Current`;
const DATE_LINE = new RegExp(
  `^(${DATE_ENDPOINT})\\s+[-–—]\\s+(${DATE_ENDPOINT})\\s+\\((.+?)\\)\\s*$`,
  'i',
);

// Aggregate-duration line: when a company groups several positions, LinkedIn's
// PDF places the total tenure ("5 years 3 months") on its own line between the
// company name and the first role's title. The pattern is just years and/or
// months — no calendar dates — and must occupy the whole line.
const AGGREGATE_DURATION_LINE =
  /^\d+\s+(?:years?|yrs?)(?:\s+\d+\s+(?:months?|mos?))?$|^\d+\s+(?:months?|mos?)$/i;

const LINKEDIN_URL =
  /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i;

function missing<T>(notes: string): SectionExtraction<T> {
  return { data: null, confidence: 'missing', notes };
}

function present<T>(data: T): SectionExtraction<T> {
  return { data, confidence: 'high' };
}

/**
 * Split the raw text into a clean array of trimmed lines with page-footers
 * removed. Blank lines are dropped — LinkedIn's PDF export does not put any
 * structural meaning on blank lines that section headers don't already carry.
 */
function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trimEnd())
    .filter((l) => l.trim().length > 0 && !PAGE_FOOTER.test(l));
}

/**
 * Match section headers in canonical LinkedIn-PDF order. For each header in
 * `SECTION_HEADERS`, take the first occurrence that appears *after* the
 * previously matched header — never before. Out-of-order content lines that
 * happen to match a later header's label (e.g. a Top Skill literally named
 * "Education", or a certification called "Experience") therefore cannot
 * shadow the real section. Headers that don't appear in the document are
 * simply skipped.
 *
 * SECTION_HEADERS is declared in the canonical order LinkedIn writes the
 * Save-to-PDF export in, so iterating it gives us the order constraint for
 * free.
 */
function findHeaders(lines: string[]): HeaderIndex[] {
  const found: HeaderIndex[] = [];
  let cursor = 0;
  for (const header of SECTION_HEADERS) {
    for (let i = cursor; i < lines.length; i++) {
      if (lines[i]!.trim() === header) {
        found.push({ header, line: i });
        cursor = i + 1;
        break;
      }
    }
  }
  return found;
}

function sliceSection(
  lines: string[],
  headers: HeaderIndex[],
  header: SectionHeader,
): string[] {
  const idx = headers.findIndex((h) => h.header === header);
  if (idx === -1) return [];
  const start = headers[idx]!.line + 1;
  const next = headers[idx + 1];
  const end = next ? next.line : lines.length;
  return lines.slice(start, end);
}

interface NameHeadlineLocation {
  name: string | null;
  headline: string | null;
  location: string | null;
  /** Lines from the trailing sidebar section that precede the identity block. */
  trailingSidebarItems: string[];
  /** Which sidebar header (if any) the trailing block came from. */
  trailingHeader: SectionHeader | null;
}

// Main sections — the identity block sits before the first one that appears.
// Summary is the canonical anchor, but a PDF without an About/Summary section
// still has the identity above Experience or Education.
const MAIN_HEADERS: ReadonlySet<SectionHeader> = new Set([
  'Summary',
  'Experience',
  'Education',
]);

/**
 * Find the last sidebar header that appears strictly before the first main
 * section header in the document. The slice between that sidebar header and
 * the main header contains whichever sidebar items exist plus the identity
 * block (name / headline / location). If no main section header is present
 * at all (rare; severely malformed export) we return null.
 */
function lastSidebarBeforeMain(
  headers: HeaderIndex[],
): { trailing: HeaderIndex | null; mainStart: HeaderIndex } | null {
  const main = headers.find((h) => MAIN_HEADERS.has(h.header));
  if (!main) return null;
  let trailing: HeaderIndex | null = null;
  for (const h of headers) {
    if (h.line >= main.line) break;
    if (SIDEBAR_HEADERS.has(h.header)) trailing = h;
  }
  return { trailing, mainStart: main };
}

/**
 * Identity (NAME / HEADLINE / LOCATION) is always the last three lines of
 * whatever sidebar slice precedes the first main section. The bound used to
 * be `Summary`, but an export without an About/Summary section still has the
 * identity above Experience or Education, and falling through to the empty
 * default would let the trailing sidebar slice (Certifications / Languages /
 * Top Skills) absorb the name/headline/location as if they were items.
 */
function extractIdentity(
  lines: string[],
  headers: HeaderIndex[],
): NameHeadlineLocation {
  const empty: NameHeadlineLocation = {
    name: null,
    headline: null,
    location: null,
    trailingSidebarItems: [],
    trailingHeader: null,
  };
  const located = lastSidebarBeforeMain(headers);
  if (!located) return empty;
  const { trailing, mainStart } = located;
  const start = trailing ? trailing.line + 1 : 0;
  const slice = lines.slice(start, mainStart.line).map((l) => l.trim()).filter(Boolean);
  if (slice.length === 0) {
    return { ...empty, trailingHeader: trailing?.header ?? null };
  }
  if (slice.length === 1) {
    return {
      name: slice[0]!,
      headline: null,
      location: null,
      trailingSidebarItems: [],
      trailingHeader: trailing?.header ?? null,
    };
  }
  if (slice.length === 2) {
    return {
      name: slice[0]!,
      headline: null,
      location: slice[1]!,
      trailingSidebarItems: [],
      trailingHeader: trailing?.header ?? null,
    };
  }
  return {
    name: slice[slice.length - 3]!,
    headline: slice[slice.length - 2]!,
    location: slice[slice.length - 1]!,
    trailingSidebarItems: slice.slice(0, slice.length - 3),
    trailingHeader: trailing?.header ?? null,
  };
}

interface RawExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  durationText: string;
  location: string | null;
  description: string | null;
  isCurrent: boolean;
}

/**
 * Each date line falls into one of three shapes:
 *   - `fresh` — standard 2-line preamble (company, title) above the dates.
 *   - `group-start` — 3-line preamble (company, aggregate-duration, title);
 *     LinkedIn groups multiple positions at the same company under one
 *     header line and stamps the total tenure between the company name and
 *     the first role's title.
 *   - `continuation` — 1-line preamble (title only); company is inherited
 *     from the most recent `group-start`.
 *
 * Classifying every date line up front means we can compute each entry's
 * description block-end as the *next* entry's preamble-start without having
 * to re-derive the shape mid-loop.
 */
type DateLineKind = 'fresh' | 'group-start' | 'continuation';

/**
 * Heuristic: does this line read like a LinkedIn company name rather than a
 * sentence of description prose? Companies render in Title Case ("Acme Corp",
 * "Goldman Sachs", "Bank of America"), are usually short, and don't terminate
 * with sentence-ending punctuation. Prose descriptions ("Led major initiatives
 * across teams.") mix in lowercase non-connector words and often end with a
 * period.
 *
 * This is intentionally conservative — when it returns false we fall through
 * to "continuation", which preserves same-company attribution rather than
 * splitting a grouped tenure into the wrong shape.
 */
const CONNECTOR_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'de', 'for', 'in', 'la', 'le', 'of',
  'on', 'or', 'the', 'to', 'von', '&', '+',
]);
function looksLikeCompanyLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('•')) return false;
  if (t.length > 80) return false;
  if (/[.?!]$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length === 0) return false;
  for (const w of words) {
    if (CONNECTOR_WORDS.has(w.toLowerCase())) continue;
    // Title-case test: a word that starts with a letter must start with a
    // capital. Words starting with a digit, ampersand or other symbol pass.
    if (/^[a-z]/.test(w)) return false;
  }
  return true;
}

/**
 * Heuristic: does this line read like a LinkedIn location string? Locations
 * are short, often comma-separated ("San Francisco, CA"), and frequently
 * carry stock geo-words ("Remote", "Hybrid", "Bay Area", "Greater Boston
 * Area", "Metropolitan Region"). We use this as a disambiguator when the
 * gap between two consecutive dates is exactly two non-bullet lines: in a
 * fresh entry that would be company + title, while in a continuation with a
 * located prev role it would be location + title.
 */
const US_STATE_ABBR = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);
const LOCATION_KEYWORD =
  /\b(remote|hybrid|on[- ]?site|bay area|metro(?:politan)?|greater|region|area|county)\b/i;
function looksLikeLocationLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('•')) return false;
  if (t.length > 100) return false;
  if (LOCATION_KEYWORD.test(t)) return true;
  const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    const second = parts[parts.length - 2]!;
    if (US_STATE_ABBR.has(last.toUpperCase())) return true;
    if (US_STATE_ABBR.has(second.toUpperCase())) return true;
  }
  return false;
}

function classifyDateLines(
  lines: string[],
  dateIdx: number[],
): DateLineKind[] {
  const kinds: DateLineKind[] = [];
  let inGroup = false;
  for (let d = 0; d < dateIdx.length; d++) {
    const j = dateIdx[d]!;
    const above2 = j >= 2 ? lines[j - 2]!.trim() : '';
    const above3 = j >= 3 ? lines[j - 3]!.trim() : '';
    const groupStart =
      AGGREGATE_DURATION_LINE.test(above2) &&
      !!above3 &&
      !DATE_LINE.test(above3);
    if (groupStart) {
      kinds.push('group-start');
      inGroup = true;
      continue;
    }
    if (inGroup && d > 0) {
      // Continuation / fresh disambiguation. A continuation role's gap to
      // the previous date is `[<location>?] [• bullets…] <title>`; a fresh
      // entry's gap is `[<prev location>?] <new company> <title>`. The
      // structural signal is the candidate company line at j-2:
      //
      //   - If it looks like a company (Title Case, ≤80 chars, no terminal
      //     punctuation) AND does NOT look like a location string, exit to
      //     fresh. This catches both the "3 non-bullet lines" canonical
      //     shape (prev-location + new-company + new-title) and the
      //     "2 non-bullet lines" no-prev-location shape (new-company +
      //     new-title), which previously stayed mis-attributed.
      //   - Otherwise stay in continuation. Plain-text descriptions like
      //     "Led major initiatives" fail the company-line check (lowercase
      //     non-connector words) and don't trigger a spurious exit.
      const prevJ = dateIdx[d - 1]!;
      let nonBullets = 0;
      for (let k = prevJ + 1; k < j; k++) {
        const t = lines[k]!.trim();
        if (!t || t.startsWith('•')) continue;
        nonBullets += 1;
      }
      const companyCandidate = j >= 2 ? lines[j - 2]!.trim() : '';
      if (
        nonBullets >= 2 &&
        looksLikeCompanyLine(companyCandidate) &&
        !looksLikeLocationLine(companyCandidate)
      ) {
        inGroup = false;
        kinds.push('fresh');
        continue;
      }
      kinds.push('continuation');
      continue;
    }
    kinds.push('fresh');
  }
  return kinds;
}

function preambleLines(kind: DateLineKind): number {
  switch (kind) {
    case 'group-start':
      return 3;
    case 'continuation':
      return 1;
    case 'fresh':
      return 2;
  }
}

/**
 * Walk the Experience block, anchoring on date lines. Each entry occupies:
 *   company, title, "<start> - <end> (<duration>)", [location], [description...]
 * Grouped same-company roles use the shape described in `classifyDateLines`.
 * Lines that don't fit the shape are skipped — never thrown — so a malformed
 * entry doesn't kill the parse for the rest of the profile.
 */
function parseExperience(lines: string[]): RawExperience[] {
  const entries: RawExperience[] = [];
  const dateIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (DATE_LINE.test(lines[i]!.trim())) dateIdx.push(i);
  }
  const kinds = classifyDateLines(lines, dateIdx);
  let groupCompany: string | null = null;

  for (let d = 0; d < dateIdx.length; d++) {
    const j = dateIdx[d]!;
    const dateMatch = lines[j]!.trim().match(DATE_LINE);
    if (!dateMatch) continue;
    const startDate = dateMatch[1]!.trim();
    const endDate = dateMatch[2]!.trim();
    const durationText = dateMatch[3]!.trim();
    const kind = kinds[d]!;
    const need = preambleLines(kind);
    if (j < need) continue; // not enough lines above for this shape

    let company: string;
    let title: string;
    if (kind === 'group-start') {
      company = lines[j - 3]!.trim();
      title = lines[j - 1]!.trim();
      groupCompany = company;
    } else if (kind === 'continuation') {
      if (!groupCompany) continue;
      company = groupCompany;
      title = lines[j - 1]!.trim();
    } else {
      company = lines[j - 2]!.trim();
      title = lines[j - 1]!.trim();
    }
    if (!company || !title) continue;

    // Next entry's preamble determines how many lines belong to *this*
    // entry's description block.
    const nextJ = dateIdx[d + 1];
    const blockEnd =
      nextJ !== undefined ? nextJ - preambleLines(kinds[d + 1]!) : lines.length;

    let cursor = j + 1;
    let location: string | null = null;
    if (cursor < blockEnd) {
      const candidate = lines[cursor]!.trim();
      if (!candidate.startsWith('•')) {
        location = candidate;
        cursor += 1;
      }
    }
    const descLines: string[] = [];
    for (let k = cursor; k < blockEnd; k++) descLines.push(lines[k]!.trim());
    const description = descLines.length > 0 ? descLines.join('\n') : null;

    entries.push({
      company,
      title,
      startDate,
      endDate,
      durationText,
      location,
      description,
      isCurrent: /^(present|current)$/i.test(endDate),
    });
  }
  return entries;
}

function toExperienceEntry(raw: RawExperience): ExperienceEntry {
  return {
    title: raw.title,
    company: raw.company,
    dates: `${raw.startDate} - ${raw.endDate}`,
    durationText: raw.durationText,
    description: raw.description,
  };
}

/**
 * Education entries are pairs: institution name on one line, then a
 * degree/field line that may carry a parenthesised date range, e.g.
 * "Bachelor of Science in Computer Science (2014 - 2018)".
 */
function parseEducation(lines: string[]): EducationItem[] {
  const items: EducationItem[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const school = lines[i]?.trim();
    const detail = lines[i + 1]?.trim();
    if (!school) continue;
    if (!detail) {
      items.push({ school, degree: null, dates: null });
      continue;
    }
    const dateMatch = detail.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (dateMatch) {
      const degree = dateMatch[1]!.trim() || null;
      const dates = dateMatch[2]!.trim();
      items.push({ school, degree, dates });
    } else {
      items.push({ school, degree: detail, dates: null });
    }
  }
  return items;
}

/**
 * Find a LinkedIn profile URL inside the Contact block. The Contact section
 * is the only place an export reliably surfaces the profile URL.
 */
function findLinkedInUrl(contactLines: string[]): string {
  for (const line of contactLines) {
    const match = line.match(LINKEDIN_URL);
    if (match) return match[0];
  }
  return '';
}

export interface ParseLinkedInOptions {
  /** Override the extracted-at timestamp; useful for deterministic tests. */
  extractedAt?: string;
}

/**
 * Parse the text content of a LinkedIn "Save to PDF" export into a
 * `ProfileData` object. Tolerant by design: malformed sections are skipped
 * with a "missing" SectionExtraction rather than throwing, so one bad entry
 * never kills the whole audit.
 */
export function parseLinkedInText(
  rawText: string,
  options: ParseLinkedInOptions = {},
): ProfileData {
  const lines = normalizeLines(rawText);
  const headers = findHeaders(lines);

  const contactLines = sliceSection(lines, headers, 'Contact');
  const summaryLines = sliceSection(lines, headers, 'Summary');
  const experienceLines = sliceSection(lines, headers, 'Experience');
  const educationLines = sliceSection(lines, headers, 'Education');

  const identity = extractIdentity(lines, headers);

  // For any sidebar section, the section's items live in the raw slice
  // between its header and the next header — *unless* that section is the
  // last sidebar before `Summary`, in which case the slice also contains
  // the identity lines (name / headline / location). `extractIdentity`
  // already split those out into `identity.trailingSidebarItems`, so use
  // that whenever the queried section is the trailing one. Without this,
  // a short Top-Skills callout (under three skills) followed directly by
  // Summary would surface the user's name, headline or location as a
  // "skill" — the Codex P2 we're closing.
  const sidebarItems = (header: SectionHeader): string[] => {
    if (!headers.some((h) => h.header === header)) return [];
    if (identity.trailingHeader === header) {
      return identity.trailingSidebarItems;
    }
    return sliceSection(lines, headers, header)
      .map((l) => l.trim())
      .filter(Boolean);
  };

  const topSkillsLines = sidebarItems('Top Skills');
  const certNames = sidebarItems('Certifications');

  const url = findLinkedInUrl(contactLines);

  const fullName = identity.name;
  const headline: SectionExtraction<string> = identity.headline
    ? present(identity.headline)
    : missing('Headline not found in PDF');

  const aboutText = summaryLines.join('\n').trim();
  const about: SectionExtraction<string> = aboutText
    ? present(aboutText)
    : missing('Summary section empty or absent in PDF');

  const rawExperiences = parseExperience(experienceLines);
  const experienceEntries = rawExperiences.map(toExperienceEntry);
  const currentRaw = rawExperiences.find((e) => e.isCurrent);
  // A profile with experience entries but none ending in "Present" /
  // "Current" is a real finding (e.g. someone between jobs), not an
  // extraction failure. The engine's scoreCurrentExperience routes
  // `confidence: 'missing' | 'low'` into the extraction-failure branch
  // (60 + needsReview) and a non-degraded confidence with null data into
  // the intended "No current role detected" 30-point branch — so we set
  // confidence='high' for the parsed-no-current case and reserve 'missing'
  // for the section-absent / no-entries-parsed case.
  const currentExperience: SectionExtraction<ExperienceEntry> = currentRaw
    ? present(toExperienceEntry(currentRaw))
    : experienceEntries.length > 0
      ? {
          data: null,
          confidence: 'high',
          notes:
            'No current role — no Experience entry ends in "Present" or "Current" in this PDF',
        }
      : missing('No experience entries parsed from PDF');
  const experienceHistory: SectionExtraction<ExperienceEntry[]> =
    experienceEntries.length > 0
      ? present(experienceEntries)
      : missing('No experience entries parsed from PDF');

  const topThree = topSkillsLines.map((l) => l.trim()).filter(Boolean).slice(0, 3);
  // The PDF only exposes the "Top Skills" callout, not the full skills list
  // or endorsement counts. Surface what we have and leave the rest as the
  // scoring engine's degraded baseline expects.
  const skills: SectionExtraction<{
    topThree: string[];
    all: string[];
    endorsementCounts: Record<string, number>;
  }> = topThree.length > 0
    ? present({ topThree, all: topThree, endorsementCounts: {} })
    : missing('Top Skills section not found in PDF');

  const educationItems = parseEducation(educationLines);
  const education: SectionExtraction<EducationItem[]> =
    educationItems.length > 0
      ? present(educationItems)
      : missing('No education entries parsed from PDF');

  const certificationItems: CertificationItem[] = certNames.map((name) => ({
    name,
    issuer: null,
    date: null,
  }));
  const certifications: SectionExtraction<CertificationItem[]> =
    certificationItems.length > 0
      ? present(certificationItems)
      : missing('No certifications parsed from PDF');

  return {
    url,
    extractedAt: options.extractedAt ?? new Date().toISOString(),
    fullName,
    headline,
    photo: missing('Photo not available in LinkedIn PDF export'),
    banner: missing('Banner not available in LinkedIn PDF export'),
    about,
    currentExperience,
    experienceHistory,
    skills,
    featured: missing('Featured not available in LinkedIn PDF export'),
    activity: missing('Activity not available in LinkedIn PDF export'),
    recommendations: missing('Recommendations not available in LinkedIn PDF export'),
    education,
    certifications,
  };
}
