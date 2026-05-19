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

interface HeaderIndex {
  header: SectionHeader;
  line: number;
}

const PAGE_FOOTER = /^\s*Page\s+\d+\s+of\s+\d+\s*$/i;

// Date line: "<start> - <end> (<duration>)".
// Separator allows ASCII hyphen, en dash or em dash with surrounding spaces.
// Anchored so a description line that happens to contain a dashed parenthetical
// can't be mistaken for the role's date line.
const DATE_LINE = /^(.+?)\s+[-–—]\s+(.+?)\s+\((.+?)\)\s*$/;

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

function findHeaders(lines: string[]): HeaderIndex[] {
  const found: HeaderIndex[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if ((SECTION_HEADERS as readonly string[]).includes(line)) {
      found.push({ header: line as SectionHeader, line: i });
    }
  }
  // Dedupe: a section may appear twice in extracted text in rare edge cases;
  // keep the first occurrence so downstream slicing stays in document order.
  const seen = new Set<SectionHeader>();
  return found.filter((h) => {
    if (seen.has(h.header)) return false;
    seen.add(h.header);
    return true;
  });
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
  certifications: string[];
}

/**
 * The block between "Certifications" and "Summary" holds the cert list
 * followed by NAME / HEADLINE / LOCATION. The PDF gives us no explicit
 * delimiter between the cert list and the identity block, so we take the
 * last three lines as name/headline/location. Multi-line headlines are
 * rare in LinkedIn PDFs because the headline column is wide enough to fit
 * the 220-char max on one line; if the structure is shorter than three
 * lines, we degrade gracefully.
 */
function extractIdentity(
  certsToSummary: string[],
): NameHeadlineLocation {
  const trimmed = certsToSummary.map((l) => l.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return { name: null, headline: null, location: null, certifications: [] };
  }
  if (trimmed.length === 1) {
    return { name: trimmed[0]!, headline: null, location: null, certifications: [] };
  }
  if (trimmed.length === 2) {
    return { name: trimmed[0]!, headline: null, location: trimmed[1]!, certifications: [] };
  }
  const name = trimmed[trimmed.length - 3]!;
  const headline = trimmed[trimmed.length - 2]!;
  const location = trimmed[trimmed.length - 1]!;
  const certifications = trimmed.slice(0, trimmed.length - 3);
  return { name, headline, location, certifications };
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
 * Walk the Experience block, anchoring on date lines. Each entry occupies:
 *   company, title, "<start> - <end> (<duration>)", [location], [description...]
 * Lines that don't fit the shape are skipped — never thrown — so a malformed
 * entry doesn't kill the parse for the rest of the profile.
 */
function parseExperience(lines: string[]): RawExperience[] {
  const entries: RawExperience[] = [];
  // First pass: find the indices of every date-shaped line. We anchor on
  // those because the company/title pair above and the optional location +
  // bullets below are positioned relative to it.
  const dateIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (DATE_LINE.test(lines[i]!.trim())) dateIdx.push(i);
  }
  for (let d = 0; d < dateIdx.length; d++) {
    const j = dateIdx[d]!;
    const dateMatch = lines[j]!.trim().match(DATE_LINE);
    if (!dateMatch) continue;
    const startDate = dateMatch[1]!.trim();
    const endDate = dateMatch[2]!.trim();
    const durationText = dateMatch[3]!.trim();
    if (j < 2) continue; // need at least 2 lines above for company + title
    const company = lines[j - 2]!.trim();
    const title = lines[j - 1]!.trim();
    if (!company || !title) continue;

    // Next entry starts 2 lines above the next date line (company/title).
    const nextDate = dateIdx[d + 1];
    const blockEnd = nextDate !== undefined ? nextDate - 2 : lines.length;

    // Location: the line immediately after dates, unless that line is
    // already the next entry's company.
    let cursor = j + 1;
    let location: string | null = null;
    if (cursor < blockEnd) {
      const candidate = lines[cursor]!.trim();
      // A description line typically starts with a bullet, but a missing
      // location is hard to disambiguate from a one-line description. The
      // common LinkedIn shape is always location-first, so treat the next
      // line as location unless it begins with the bullet glyph.
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
      isCurrent: /^present$/i.test(endDate),
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
  const topSkillsLines = sliceSection(lines, headers, 'Top Skills');
  const certsBlock = sliceSection(lines, headers, 'Certifications');
  const summaryLines = sliceSection(lines, headers, 'Summary');
  const experienceLines = sliceSection(lines, headers, 'Experience');
  const educationLines = sliceSection(lines, headers, 'Education');

  const identity = extractIdentity(certsBlock);

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
  const currentExperience: SectionExtraction<ExperienceEntry> = currentRaw
    ? present(toExperienceEntry(currentRaw))
    : experienceEntries[0]
      ? present(experienceEntries[0])
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

  const certNames = identity.certifications;
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
