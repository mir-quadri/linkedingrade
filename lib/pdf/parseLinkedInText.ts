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
  // ORIGINAL goal: recognise Publications / Patents / Honors-Awards
  // sections so their content gets stripped from the identity slice
  // between Certifications and Summary (the "Erum Quadri" failure
  // class). Codex (R3 P2 + R4 P2) flagged that bare singletons —
  // `Awards`, `Publications`, `Publication`, `Patents`, `Patent` —
  // collide with sidebar items whose text is exactly that string
  // (a Top Skill literally called "Patents", a Certification called
  // "Awards"). In lenient mode (real exports run sections together
  // with no blank lines) the boundary check is skipped, the bare
  // label matches the sidebar item, and that item gets promoted to a
  // section header — truncating its parent block.
  //
  // The compound `Honors-Awards` variants are unambiguous and stay
  // in the list (they cover LinkedIn's documented label forms). The
  // bare nouns are removed. The synthetic test fixtures never
  // actually reproduced the Publications-bleed-into-identity bug, so
  // dropping them costs only speculative defensive value; if a real
  // verifiable case surfaces, they come back with a tighter
  // disambiguation gate (require strict blank-above, OR require a
  // structural neighbour like "(YYYY)" / "Patent N,NNN,NNN" /
  // "Co-Authors:").
  'Honors-Awards',
  'Honors and Awards',
  'Honors and awards',
  'Honors & Awards',
  'Honors & awards',
  'Summary',
  'Experience',
  'Education',
] as const;
type SectionHeader = (typeof SECTION_HEADERS)[number];

// Sidebar sections sit above the identity block in a LinkedIn PDF. Any of
// them can be the last one before the name appears (Certifications is the
// canonical trailing header, but the Certifications section is optional —
// and Publications / Patents / Honors / Awards can run BELOW it when a
// profile uses them).
const SIDEBAR_HEADERS: ReadonlySet<SectionHeader> = new Set([
  'Contact',
  'Top Skills',
  'Languages',
  'Certifications',
  // Bare `Publications` / `Publication` / `Patents` / `Patent` removed
  // — see SECTION_HEADERS comment. Honors-Awards compound variants
  // stay; they're unambiguous.
  'Honors-Awards',
  'Honors and Awards',
  'Honors and awards',
  'Honors & Awards',
  'Honors & awards',
]);

interface HeaderIndex {
  header: SectionHeader;
  line: number;
}

const PAGE_FOOTER = /^\s*Page\s+\d+\s+of\s+\d+\s*$/i;
// "-- N of M --" separator that pdf-parse injects between rendered pages of
// the export. Like the page footer, it can appear mid-section (between an
// entry's title and its date line) and must be stripped before structural
// parsing so adjacent content reads as continuous.
const PAGE_SEPARATOR = /^\s*-{2,}\s*\d+\s+of\s+\d+\s*-{2,}\s*$/i;

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

interface NormalizedLines {
  /** Non-blank, non-page-footer lines in document order. */
  lines: string[];
  /**
   * For each entry in `lines`, true when the immediately preceding raw line
   * was blank (or a page footer, which acts as a paragraph break).
   * LinkedIn's PDF export puts a blank line above every real section header,
   * so this is the structural signal we use to distinguish a header from a
   * sidebar list item that happens to share the header's text (e.g. a Top
   * Skill literally named "Languages").
   */
  isBlankAbove: boolean[];
}

function normalizeLines(text: string): NormalizedLines {
  const raw = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trimEnd());
  const lines: string[] = [];
  const isBlankAbove: boolean[] = [];
  let pendingBlank = true; // start-of-doc counts as a paragraph break
  for (const r of raw) {
    const t = r.trim();
    if (!t || PAGE_FOOTER.test(r) || PAGE_SEPARATOR.test(r)) {
      pendingBlank = true;
      continue;
    }
    lines.push(r);
    isBlankAbove.push(pendingBlank);
    pendingBlank = false;
  }
  return { lines, isBlankAbove };
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
function findHeadersWithBoundary(
  lines: string[],
  isBlankAbove: boolean[] | null,
): HeaderIndex[] {
  const found: HeaderIndex[] = [];
  let cursor = 0;
  for (const header of SECTION_HEADERS) {
    for (let i = cursor; i < lines.length; i++) {
      // Two-part check: the text must match AND, when a boundary array is
      // supplied, the line must sit at a paragraph boundary (blank line /
      // page footer / start-of-doc above it). The boundary check is what
      // stops a sidebar item literally named "Languages" / "Certifications"
      // / etc. from being recorded as the real header — adjacent list items
      // don't carry the blank-above marker that real section headers do.
      if (lines[i]!.trim() === header && (!isBlankAbove || isBlankAbove[i])) {
        found.push({ header, line: i });
        cursor = i + 1;
        break;
      }
    }
  }
  return found;
}

/**
 * Find section headers, preferring strict blank-above matching but falling
 * back to lenient (order-aware first match without the boundary requirement)
 * when strict finds strictly fewer headers. Real LinkedIn "Save to PDF"
 * exports run sidebar items directly into the next section header with no
 * blank line between them — strict mode finds nothing past "Contact" on
 * those, while lenient mode recovers the full structure. Synthetic test
 * fixtures put blank lines around every header, so strict and lenient
 * usually tie and strict wins (preserving the "Languages skill must not
 * shadow the Languages header" guarantee).
 */
function findHeaders(
  lines: string[],
  isBlankAbove: boolean[],
): HeaderIndex[] {
  const strict = findHeadersWithBoundary(lines, isBlankAbove);
  const lenient = findHeadersWithBoundary(lines, null);
  return lenient.length > strict.length ? lenient : strict;
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
 * Words that disqualify a candidate line from being treated as a person's
 * full name. These are the high-signal nouns/verbs that appear in
 * certification titles ("Certified Ethical Hacker", "Kubernetes Certified
 * Administrator", "Foundations of Project Management"). Stored lowercase
 * for case-insensitive lookup.
 */
const CERT_DISQUALIFIERS = new Set([
  'certified', 'certificate', 'certification',
  'professional', 'practitioner', 'administrator', 'specialist',
  'associate', 'foundation', 'foundations',
  'master', 'masters', 'expert', 'analyst', 'consultant', 'scrum',
  'fundamentals', 'principles',
  // Common LinkedIn job-title words. Without these, a 2-word headline like
  // "Senior Engineer" would pass as a person's name and shadow the real
  // identity line above it.
  'engineer', 'engineering', 'developer', 'designer', 'manager',
  'director', 'lead', 'leader', 'principal', 'staff', 'senior', 'junior',
  'head', 'chief', 'vice', 'president', 'founder', 'cofounder',
  'partner', 'owner', 'recruiter', 'coach', 'mentor', 'advisor',
  'architect', 'scientist', 'researcher', 'product', 'program',
  'project', 'operations', 'finance', 'marketing', 'sales',
  // Common industry-concept SUFFIX words. These show up as the wrap
  // target of a long LinkedIn headline (`Phrase | Phrase |` /
  // `Digital Transformation`) — when the wrap target is a 2-3
  // Title-Case word phrase from concept vocabulary, it slips past
  // the strict `looksLikeName` heuristic and gets picked as the
  // name. Examples Codex / the user surfaced on PR #24:
  //   - "Digital Transformation"  (Erum's profile)
  //   - "Data Science"            (Codex R6 P2 trace)
  //   - "Cloud Architecture"      (Codex R5 P2 trace)
  // Adding the suffix words to the disqualifier list catches these
  // structurally — no continuation-skip machinery required, no
  // wrap-vs-sidebar-bleed structural ambiguity. Real person names
  // very rarely contain these tokens.
  'transformation', 'science', 'architecture', 'analytics',
  'strategy', 'technology', 'intelligence', 'automation', 'learning',
  'infrastructure', 'systems', 'solutions', 'services', 'consulting',
  'communications', 'media', 'relations',
  // Codex R7 P2 + independent review: the vocabulary above misses
  // common headline-suffix nouns like "Global Expansion", "Business
  // Growth", "Customer Success". Widening here keeps the failure mode
  // narrow without adding structural disambiguation. The principle
  // for inclusion: a noun that recurs as a LinkedIn headline component
  // AND is vanishingly rare as a personal-name token.
  'expansion', 'growth', 'success', 'development', 'innovation',
  'excellence', 'experience', 'performance', 'enablement',
  'engagement', 'acquisition', 'retention', 'optimization',
  'efficiency', 'delivery', 'partnerships',
  // Codex R8 P2: morphological variants of tokens already in the
  // list (`leader` → `leadership`, `manager` → `management`) plus
  // common -ance/-ment/-ence headline nouns. Pairing the noun-form
  // with the agent-form mirrors the existing `engineer`/`engineering`
  // pattern above.
  'leadership', 'management', 'governance', 'compliance',
  'procurement', 'improvement',
  // Codex R9 P2: industry/domain SECTOR nouns. The vocab kept covering
  // FUNCTION nouns (transformation, strategy, …) but missed sector
  // labels that recur as headline suffixes — "New Markets", "Retail
  // Banking", "Investment Banking", "Capital Markets". Same inclusion
  // principle as the rest: sector noun common as a LinkedIn headline
  // component, vanishingly rare as a personal-name token.
  'markets', 'banking', 'lending', 'trading', 'investment', 'capital',
  'insurance', 'wealth', 'portfolio', 'manufacturing', 'logistics',
  'cybersecurity', 'networking', 'healthcare', 'sustainability',
  'research',
]);

/**
 * Does this line read like a person's full name? LinkedIn names render in
 * Title Case across 2-4 words ("Mir Quadri", "Jane Doe", "Mary O'Brien",
 * "Jean-Luc Picard"), without connector words ("of", "the", "and") and
 * without cert-y nouns ("Certified", "Practitioner", …). The heuristic is
 * conservative — when it returns false we fall back to the legacy "last
 * three lines" identity slot, which preserves the pre-existing behaviour
 * for malformed inputs.
 */
function looksLikeName(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/[.?!:]$/.test(t)) return false; // sentences / bullets
  const words = t.split(/\s+/);
  // 2-3 word Title-Case names cover the LinkedIn norm ("Mir Quadri",
  // "No Summary Person"). 4+ word candidates are far more likely to be
  // a cert title ("Amazon Web Services Cloud", "Project Management and
  // Risk") than a person — restricting the window keeps cert lines from
  // being promoted into the identity slot.
  if (words.length < 2 || words.length > 3) return false;
  for (const w of words) {
    if (!/^[A-Z][\p{L}'\-]*$/u.test(w)) return false;
    const lower = w.toLowerCase();
    if (CONNECTOR_WORDS.has(lower)) return false;
    if (CERT_DISQUALIFIERS.has(lower)) return false;
  }
  return true;
}

/**
 * Permissive negative-of-`looksLikeName` for the legacy fallback.
 *
 * `looksLikeName` is conservative: it rejects 4+ word names, names with
 * middle-initial punctuation ("John M. Smith"), single-token mononyms,
 * and anything outside the strict 2-3 Title-Case word window. Those
 * rejections are fine when there's a CLEAN candidate elsewhere in the
 * slice, but the fallback is the path for slices where no line passed
 * — including legitimate identity lines whose shape happens to fall
 * outside the conservative window. So the fallback needs a SOFTER
 * gate: reject only candidates that are unambiguously NOT names.
 *
 * Things a real name never contains:
 *   - `|` (LinkedIn's canonical headline separator)
 *   - `@`, `&`, `/`, `•`, `·` (headline punctuation / emoji bullets)
 *   - ` at ` (case-insensitive — "Director at Acme")
 *   - `?` `!` `:` at end (true sentence markers — trailing `.` IS
 *     allowed for dotted suffixes like "Jr." / "Sr." / "Ph.D.")
 *   - more than 5 whitespace-separated tokens (real full names cap
 *     out around 4-5; longer is a headline / publication title)
 *   - commas — real names rarely contain them, but short headline
 *     fragments do ("Senior Director, Data"). (Codex R6 P2.)
 *   - any token in CERT_DISQUALIFIERS — short title-shaped fragments
 *     like "Engineering Manager" or "Senior Counsel" slip the other
 *     checks because they have no punctuation, but the disqualifier
 *     word list (engineer / manager / director / senior / etc.)
 *     catches them. Real names don't contain these tokens.
 *     (Codex R6 P2.)
 */
function obviouslyNotAName(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/[|@&/•·,]/.test(t)) return true;
  if (/\sat\s/i.test(t)) return true;
  if (/[?!:]$/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length > 5) return true;
  for (const w of words) {
    const lower = w.toLowerCase().replace(/[.,]+$/, '');
    if (CERT_DISQUALIFIERS.has(lower)) return true;
  }
  return false;
}

/**
 * Identity (NAME / HEADLINE / LOCATION) sits between the last sidebar
 * section and the first main section. Three shapes have to be handled:
 *
 *   1. Real LinkedIn export, no blank lines: the trailing Certifications
 *      block may contain wrapped 2-line cert names that immediately bleed
 *      into the identity. We locate the fullName line via the
 *      `looksLikeName` heuristic, everything before is sidebar items, and
 *      everything after up to the last line is the (possibly multi-line)
 *      headline. The last line is the location.
 *
 *   2. Synthetic-style export with blanks: the slice often contains just
 *      `<name> <headline> <location>` on three lines. The name heuristic
 *      picks the name; the same after-name logic produces a single-line
 *      headline and the location.
 *
 *   3. Malformed slice where no line looks like a name: fall back to the
 *      legacy "last three lines = name/headline/location" rule so existing
 *      degraded-input behaviour is preserved.
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
  const trailingHeader = trailing?.header ?? null;
  if (slice.length === 0) {
    return { ...empty, trailingHeader };
  }

  // Walk backwards from the second-to-last line looking for the first
  // line that reads like a person's name. The last line is always the
  // location anchor; everything between the name and the location is the
  // (possibly multi-line) headline; everything before the name is trailing
  // sidebar content (wrapped certs / language items).
  //
  // Walking *backwards* matters: a sidebar slice that runs
  // ["Cert One", "Alex Example", "Engineer", "Remote"] would otherwise pick
  // the cert name first. From the bottom, "Remote" is location, "Engineer"
  // fails the length check, and "Alex Example" wins as the name.
  //
  // Wrapped-headline note: when a long headline wraps onto a second physical
  // line (LinkedIn pdf-parse output for `Phrase | … |` / `Digital
  // Transformation` / location), the wrap-target line — `Digital
  // Transformation` for Erum Manzoor's profile — used to slip past
  // `looksLikeName` and get picked as the name. The fix doesn't need
  // structural pattern-matching (every variant of it had a regression class
  // — see PR #24's discussion). Instead, `CERT_DISQUALIFIERS` was extended
  // to include common industry-concept suffix words ("transformation",
  // "science", "architecture", "analytics", "strategy", "technology",
  // "automation", "learning", etc.), which makes `looksLikeName` correctly
  // reject the wrap target. The walk-backwards then naturally finds the
  // real name above the headline.
  let nameIdx = -1;
  for (let k = slice.length - 2; k >= 0; k--) {
    if (looksLikeName(slice[k]!)) {
      nameIdx = k;
      break;
    }
  }
  if (nameIdx !== -1) {
    const name = slice[nameIdx]!;
    const sidebarItems = slice.slice(0, nameIdx);
    const after = slice.slice(nameIdx + 1);
    let headline: string | null = null;
    let location: string | null = null;
    if (after.length === 1) {
      location = after[0]!;
    } else if (after.length >= 2) {
      location = after[after.length - 1]!;
      headline = after.slice(0, after.length - 1).join(' ').replace(/\s+/g, ' ').trim();
    }
    return { name, headline, location, trailingSidebarItems: sidebarItems, trailingHeader };
  }

  // Legacy fallback for slices where no line passes the name heuristic.
  // Validate the candidate against a SOFTER check (`obviouslyNotAName`)
  // before emitting it: reject only clearly-wrong candidates (pipes,
  // ampersands, sentence punctuation, " at "), so legitimate names
  // that `looksLikeName` itself rejects — 4+ word names, names with
  // middle-initial punctuation like "John M. Smith", single-token
  // mononyms — still come through the fallback. (Codex R1 P2 on PR
  // #22 — without this softening, my Round-0 strict-fallback guard
  // would have regressed clean profiles whose identity line happens
  // to fail the conservative `looksLikeName` heuristic.)
  const candidate =
    slice.length === 1 ? slice[0]!
    : slice.length === 2 ? slice[0]!
    : slice[slice.length - 3]!;
  const honestCandidate = obviouslyNotAName(candidate) ? null : candidate;
  if (slice.length === 1) {
    return {
      name: honestCandidate, headline: null, location: null,
      trailingSidebarItems: [], trailingHeader,
    };
  }
  if (slice.length === 2) {
    return {
      name: honestCandidate, headline: null, location: slice[1]!,
      trailingSidebarItems: [], trailingHeader,
    };
  }
  return {
    name: honestCandidate,
    headline: slice[slice.length - 2]!,
    location: slice[slice.length - 1]!,
    trailingSidebarItems: slice.slice(0, slice.length - 3),
    trailingHeader,
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
/**
 * A single word is "company-like" when one of these holds:
 *   - It's a connector word ("of", "the", "&", …).
 *   - It starts with an uppercase letter (canonical Title Case).
 *   - It starts with a digit or symbol (e.g. "23andMe", "3M", "&pizza").
 *   - It's internally capitalised (camelCase like "eBay", "iRobot",
 *     "iPhone", "GoPro").
 *   - It contains a domain-style suffix like ".com", ".io", ".ai"
 *     ("monday.com", "x.ai", "openai.com").
 *
 * The internal-cap and dotted-brand patterns are what let lowercase-led
 * modern company names exit a grouped tenure instead of being mistaken for
 * description text.
 */
function isCompanyWord(w: string): boolean {
  if (!w) return false;
  if (CONNECTOR_WORDS.has(w.toLowerCase())) return true;
  if (/^[A-Z]/.test(w)) return true;
  if (/^[^a-zA-Z]/.test(w)) return true; // digit / symbol start
  if (/[A-Z]/.test(w)) return true; // internal capital (eBay, iRobot)
  if (/\.[a-zA-Z]{2,}\b/.test(w)) return true; // monday.com, x.ai
  return false;
}

function looksLikeCompanyLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('•')) return false;
  if (t.length > 80) return false;
  if (/[.?!]$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length === 0) return false;
  for (const w of words) {
    if (!isCompanyWord(w)) return false;
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
/**
 * Spelled-out US state names. LinkedIn PDFs surface either the two-letter
 * abbreviation ("San Francisco, CA") or the full name ("San Francisco,
 * California"), and the full-name form needs to match the same location
 * gate that the abbreviation does. Stored lowercase for case-insensitive
 * lookup.
 */
const US_STATE_NAME = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada',
  'new hampshire','new jersey','new mexico','new york','north carolina',
  'north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
  'south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming',
  'district of columbia','puerto rico',
]);
/**
 * Country and major-subdivision names that show up as the trailing token of
 * a LinkedIn location string ("London, England", "Toronto, Ontario",
 * "Berlin, Germany", "Mumbai, India"). Stored lowercase for case-insensitive
 * matching. Not exhaustive — covers the high-frequency LinkedIn user
 * geographies; uncommon places fall through to the canonical group-exit
 * heuristic without triggering a fresh-entry exit.
 */
const COUNTRY_OR_REGION_NAMES = new Set([
  'usa','united states','u.s.','u.s.a.',
  'canada','mexico',
  'united kingdom','u.k.','england','scotland','wales','northern ireland','ireland',
  'germany','france','spain','italy','portugal','netherlands','belgium','switzerland',
  'sweden','norway','denmark','finland','austria','poland','czech republic','czechia',
  'greece','hungary','romania','luxembourg',
  'australia','new zealand',
  'india','china','japan','south korea','korea','singapore','hong kong','taiwan',
  'thailand','vietnam','philippines','indonesia','malaysia','pakistan','bangladesh',
  'brazil','argentina','chile','colombia','peru','venezuela',
  'israel','uae','united arab emirates','saudi arabia','turkey','qatar','jordan','lebanon',
  'south africa','egypt','nigeria','kenya','morocco','ghana',
  'russia','ukraine','belarus',
  // Common UK/Canada/Australia/India subdivisions that often appear as the
  // last token (e.g. "Toronto, Ontario", "Sydney, New South Wales",
  // "Mumbai, Maharashtra").
  'ontario','quebec','british columbia','alberta','manitoba','saskatchewan',
  'nova scotia','new brunswick',
  'new south wales','victoria','queensland','western australia','tasmania',
  'south australia','australian capital territory','northern territory',
  'maharashtra','karnataka','tamil nadu','delhi','telangana','gujarat',
  'kerala','west bengal','uttar pradesh','rajasthan','haryana','punjab',
]);
/**
 * Location-style phrases that LinkedIn surfaces *instead* of a comma-
 * separated City/State/Country line. Each pattern matches a whole phrase
 * (e.g. "Bay Area", "Greater Boston Area", "Metropolitan Region") rather
 * than a bare keyword — bare `region` / `area` / `county` would otherwise
 * fire on description text like "multi-region failover" or
 * "owns the area roadmap" and steal it as a location.
 */
const LOCATION_PHRASES: RegExp[] = [
  /\b(?:remote|hybrid|on[- ]?site)\b/i,
  /\bbay area\b/i,
  /\bgreater\s+[A-Z][a-z]/, // "Greater Boston", "Greater Atlanta"
  /\b(?:metro|metropolitan)\s+(?:area|region)\b/i,
  /\bmetropolitan\s+[A-Z][a-z]/, // "Metropolitan Tokyo"
];
function matchesLocationPhrase(t: string): boolean {
  for (const re of LOCATION_PHRASES) {
    if (re.test(t)) return true;
  }
  return false;
}
function looksLikeLocationLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('•')) return false;
  if (t.length > 100) return false;
  if (matchesLocationPhrase(t)) return true;
  const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    const lastLower = last.toLowerCase();
    if (US_STATE_ABBR.has(last.toUpperCase())) return true;
    if (US_STATE_NAME.has(lastLower)) return true;
    if (COUNTRY_OR_REGION_NAMES.has(lastLower)) return true;
    // "City, Region, Country" form: check the middle token too, since the
    // last one might be a country we don't list (e.g. "Mumbai, Maharashtra,
    // <Unlisted Country>") and the middle one carries the locality signal.
    if (parts.length >= 3) {
      const second = parts[parts.length - 2]!;
      const secondLower = second.toLowerCase();
      if (US_STATE_ABBR.has(second.toUpperCase())) return true;
      if (US_STATE_NAME.has(secondLower)) return true;
      if (COUNTRY_OR_REGION_NAMES.has(secondLower)) return true;
    }
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
      // Only treat the first post-date line as location when it actually
      // *looks* like a LinkedIn location string (City + state/country, a
      // location keyword like "Remote" / "Bay Area", or "Greater X Area").
      // Otherwise leave it for description — a role that omits location and
      // begins with a plain-text description sentence used to lose that
      // sentence to the location field.
      if (!candidate.startsWith('•') && looksLikeLocationLine(candidate)) {
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
 * Standalone education-date range, e.g. "2014 - 2018" or "Sep 2014 - May 2018"
 * appearing on its own line. Used to detect three-line education entries
 * where the dates aren't parenthesised into the degree line.
 */
const STANDALONE_EDU_DATES =
  /^(?:(?:[A-Za-z]{3,9}\s+)?(?:19|20)\d{2})\s*[-–—]\s*(?:(?:[A-Za-z]{3,9}\s+)?(?:19|20)\d{2}|Present|Current)$/i;

/**
 * Education entries come in two shapes:
 *   - Two lines: `School` then `Degree (Dates)` — dates parenthesised into
 *     the degree line.
 *   - Three lines: `School` then `Degree` then a standalone date-range
 *     line.
 *
 * The fixed `i += 2` walk treated the standalone date line as the next
 * school, corrupting every subsequent entry (the Codex P2 we're closing).
 * The loop now looks ahead — when the line after the degree matches a
 * date-range pattern, consume it as this entry's dates and skip it before
 * moving on.
 */
function parseEducation(lines: string[]): EducationItem[] {
  const items: EducationItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const school = lines[i]?.trim();
    i += 1;
    if (!school) continue;
    if (i >= lines.length) {
      items.push({ school, degree: null, dates: null });
      break;
    }
    const detail = lines[i]!.trim();
    i += 1;
    const parenMatch = detail.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      const degree = parenMatch[1]!.trim() || null;
      const dates = parenMatch[2]!.trim();
      items.push({ school, degree, dates });
      continue;
    }
    if (i < lines.length && STANDALONE_EDU_DATES.test(lines[i]!.trim())) {
      items.push({ school, degree: detail || null, dates: lines[i]!.trim() });
      i += 1;
      continue;
    }
    items.push({ school, degree: detail || null, dates: null });
  }
  return items;
}

/**
 * LinkedIn's PDF export wraps long certification names onto two lines —
 * "Project Management and Risk\nAnalysis" → "Project Management and Risk
 * Analysis" — without any structural delimiter. Walk the sidebar slice and
 * fold any short (1-2 word) follow-up line into the preceding certification,
 * unless that follow-up line itself reads like the start of a new cert
 * (3+ words). Standalone short-name certs ("Practitioner" alone on a line
 * with another short line next) are rare enough to treat as continuations
 * — and the alternative would split every long cert in two.
 */
function reassembleCertifications(rawLines: string[]): string[] {
  const certs: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const current = rawLines[i]!.trim();
    if (!current) { i += 1; continue; }
    const next = i + 1 < rawLines.length ? rawLines[i + 1]!.trim() : '';
    const nextWords = next ? next.split(/\s+/) : [];
    if (next && nextWords.length > 0 && nextWords.length <= 2) {
      certs.push(`${current} ${next}`.replace(/\s+/g, ' ').trim());
      i += 2;
      continue;
    }
    certs.push(current);
    i += 1;
  }
  return certs;
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
  const { lines, isBlankAbove } = normalizeLines(rawText);
  const headers = findHeaders(lines, isBlankAbove);

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

  // Collapse the wrapped summary lines into a single paragraph. The PDF
  // export hard-wraps the About block at the column boundary; joining with
  // spaces (rather than newlines) reconstructs the prose as the user wrote
  // it and keeps the missing-space artefacts ("production.Four", "stick.What")
  // exactly where they appear in the source — those quirks live inside a
  // single line in the PDF, so neither join introduces or removes a space.
  const aboutText = summaryLines.map((l) => l.trim()).filter(Boolean).join(' ').trim();
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

  const reassembledCertNames = reassembleCertifications(certNames);
  const certificationItems: CertificationItem[] = reassembledCertNames.map((name) => ({
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
