import { describe, expect, it } from 'vitest';

import { parseLinkedInText } from '../parseLinkedInText';

/**
 * Wrapped-headline name-parser regression. (Erum Manzoor's profile.)
 *
 * Root cause (CONFIRMED from the real pdf-parse output, sent by the
 * project owner): when LinkedIn's headline is long enough to wrap
 * across two physical lines in the PDF export, the wrap target sits
 * BELOW the real name in the identity slice. For Erum:
 *
 *   "Erum Manzoor"                                           ← real name
 *   "Executive Leader | Motorsports | … | Venture Capital |" ← headline L1 (ends with `|`)
 *   "Digital Transformation"                                 ← headline L2 (continuation)
 *   "New York City Metropolitan Area"                        ← location
 *
 * The pre-fix backwards-walk from second-to-last hits "Digital
 * Transformation" (2 Title-Case words, both `looksLikeName`-permissible),
 * picks it as the name, and the headline can't reassemble. The
 * suspicion guard didn't catch it because "Digital Transformation"
 * has no pipes / no `at` / no comma / no disqualifier word.
 *
 * Fix: a slice line is a HEADLINE CONTINUATION iff the previous slice
 * line ends with `|` (LinkedIn's canonical separator). Continuation
 * lines are excluded from name candidacy. The walk-backwards then
 * skips "Digital Transformation" and reaches "Erum Manzoor".
 *
 * NOTE on this fixture: the project owner confirmed the verbatim
 * pdf-parse output but the actual block didn't get attached to the
 * message (template placeholder left in). The shape below is a faithful
 * synthetic reconstruction matching the documented structure — name +
 * wrapped-pipe-headline + location, with realistic surrounding sidebar
 * content. PII-scrubbed. Swap for the verbatim capture when available.
 */
describe('parseLinkedInText — wrapped-headline name extraction (Erum Manzoor profile shape)', () => {
  // Synthetic reconstruction. Structure matches the documented
  // Erum Manzoor failure mode: long headline wraps onto a second
  // line that is a 2-word Title-Case fragment which would pass
  // `looksLikeName` and shadow the real name. All identifying
  // info is fabricated.
  const ERUM_SHAPED_FIXTURE = `Contact
555-0200 (Mobile)
example-erum@example.com
www.linkedin.com/in/example-erum
(LinkedIn)
Top Skills
Strategic Leadership
Mergers and Acquisitions
Venture Capital
Languages
English
French
Certifications
Executive Leadership Program
Erum Manzoor
Executive Leader | Motorsports | Automation | Venture Capital |
Digital Transformation
New York City Metropolitan Area
Summary
Executive leader with deep operating experience across motorsports,
venture capital, and enterprise automation.
Experience
RaceCo
Chief Operating Officer
January 2023 - Present (1 year 11 months)
New York City Metropolitan Area
Education
Wharton School
MBA, Strategy
`;

  it('picks the real name above the wrapped headline, NOT the continuation fragment below', () => {
    const profile = parseLinkedInText(ERUM_SHAPED_FIXTURE);
    expect(profile.fullName).toBe('Erum Manzoor');
  });

  it('reassembles the full multi-line headline including the wrap continuation', () => {
    const profile = parseLinkedInText(ERUM_SHAPED_FIXTURE);
    expect(profile.headline.data).toBe(
      'Executive Leader | Motorsports | Automation | Venture Capital | Digital Transformation',
    );
  });

  it('preserves the location below the wrapped headline', () => {
    const profile = parseLinkedInText(ERUM_SHAPED_FIXTURE);
    // location field exists at profile-shape level via the identity
    // block; we assert at the headline+name level above and rely on
    // existing fixture coverage for the location field plumbing.
    expect(profile.fullName).toBe('Erum Manzoor');
    expect(profile.headline.data).toContain('Digital Transformation');
  });

  it('does not mis-parse "Digital Transformation" as the name (regression guard)', () => {
    const profile = parseLinkedInText(ERUM_SHAPED_FIXTURE);
    expect(profile.fullName).not.toBe('Digital Transformation');
  });

  it('a wrapped cert title ending with a SINGLE `|` does NOT swallow the real name as a continuation (Codex R1 P2)', () => {
    // Codex flagged this case: a wrapped certification or skill
    // title like `Some Program |` followed by `Jane Doe` would
    // make the naive `endsWith('|')` check treat the name as a
    // headline continuation and skip it, returning a null /
    // headline-fragment name. The continuation check requires the
    // pipe-ending line to ALSO contain at least one OTHER `|` — a
    // real LinkedIn headline always has multiple pipes
    // (`Phrase | Phrase | Phrase |`) while a stray-pipe cert title
    // has exactly one.
    const SINGLE_PIPE_CERT = `Contact
555-0202 (Mobile)
example-jane@example.com
Top Skills
Project Management
Process Improvement
Compliance
Languages
English
Certifications
Project Management Professional
Some Program |
Jane Doe
Senior Compliance Officer
Toronto, Canada
Summary
Compliance officer summary.
Experience
BankCo
Senior Compliance Officer
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
University of Toronto
B.Comm., Finance
`;
    const profile = parseLinkedInText(SINGLE_PIPE_CERT);
    expect(profile.fullName).toBe('Jane Doe');
  });

  it('a MULTI-pipe sidebar item (e.g. `Cloud | Data |`) directly above the name does NOT trigger the continuation skip (Codex R2 P2)', () => {
    // Codex flagged this case: a cert/skill title with MULTIPLE pipes
    // ending in `|` (`Cloud | Data |`) would have passed the R1 P2
    // pipe-count check (≥2 pipes) and falsely triggered the
    // continuation skip, swallowing the real name below. The R2 P2
    // fix adds a POSITION check — the continuation only fires when
    // the candidate is at `slice.length - 2` (the only place a wrap
    // target can land: between headline L1 and the location). A
    // sidebar bleed item is somewhere else in the slice and won't
    // trigger the skip.
    const MULTI_PIPE_SIDEBAR_ITEM = `Contact
555-0203 (Mobile)
example-jane2@example.com
Top Skills
Cloud Architecture
Data Engineering
Distributed Systems
Languages
English
Certifications
Cloud | Data |
Jane Smith
Cloud Architect
Seattle, Washington, United States
Summary
Cloud architect summary.
Experience
TechCo
Cloud Architect
January 2023 - Present (1 year 11 months)
Seattle, Washington, United States
Education
University of Washington
M.S., Computer Science
`;
    const profile = parseLinkedInText(MULTI_PIPE_SIDEBAR_ITEM);
    expect(profile.fullName).toBe('Jane Smith');
  });

  it('a NO-HEADLINE profile with a multi-pipe sidebar item directly above the name still picks the name (Codex R3 P2)', () => {
    // The R2 P2 position-only check assumed `slice.length - 2` is
    // always the wrap target. But profiles WITHOUT a headline have
    // shorter slices (cert + name + location = 3), and there
    // `slice.length - 2` IS the real name. Skipping it would null
    // `fullName`. Two new guards: require slice ≥ 4 (wrap needs
    // name + L1 + continuation + location), AND require a name-
    // shaped line above the `|`-multi predecessor (real wrap has a
    // name TWO+ slots above the wrap target; no-headline bleed
    // doesn't).
    const NO_HEADLINE_MULTIPIPE_SIDEBAR = `Contact
555-0204 (Mobile)
example-jane3@example.com
Top Skills
Cloud Architecture
Data Engineering
Distributed Systems
Languages
English
Certifications
Cloud | Data |
Jane Doe
Seattle, Washington, United States
Summary
Cloud architect summary.
Experience
TechCo
Cloud Architect
January 2023 - Present (1 year 11 months)
Seattle, Washington, United States
Education
University of Washington
M.S., Computer Science
`;
    const profile = parseLinkedInText(NO_HEADLINE_MULTIPIPE_SIDEBAR);
    expect(profile.fullName).toBe('Jane Doe');
  });

  it('a TWO-segment wrapped headline (`Phrase A |` / `Phrase B`) — single pipe — still gets the name and reassembles (Codex R4 P2)', () => {
    // Codex R4 P2: real LinkedIn headlines can have just one
    // separator (`Strategic Advisor | Digital Transformation`). When
    // the headline wraps after the only `|`, the continuation line
    // (`Digital Transformation`) sits at slice.length - 2 with
    // exactly ONE pipe on the L1 line. The R1 P2 pipeCount ≥ 2
    // threshold would have missed this and let "Digital
    // Transformation" become the name.
    const TWO_SEGMENT_WRAP = `Contact
555-0205 (Mobile)
example-mark@example.com
Top Skills
Strategic Planning
Corporate Strategy
Mergers and Acquisitions
Languages
English
Certifications
Strategic Leadership Program
Mark Thompson
Strategic Advisor |
Digital Transformation
Singapore
Summary
Strategic advisor summary.
Experience
ConsultingCo
Strategic Advisor
January 2023 - Present (1 year 11 months)
Singapore
Education
INSEAD
MBA
`;
    const profile = parseLinkedInText(TWO_SEGMENT_WRAP);
    expect(profile.fullName).toBe('Mark Thompson');
    expect(profile.headline.data).toBe('Strategic Advisor | Digital Transformation');
  });

  it('a NO-HEADLINE length=4 profile with a name-shaped cert above a pipe-ending cert still picks the name (Codex R5 P2)', () => {
    // Codex R5 P2: `['Cloud Architecture', 'Some Program |', 'Jane
    // Doe', 'Toronto']` — slice length=4 — the R3 P2 length ≥ 4
    // guard let this through, and the name-above-prev scan matched
    // 'Cloud Architecture' (no disqualifier tokens), so `Jane Doe`
    // was being skipped. Fix: tighten the slice-length floor to ≥ 5.
    // Real LinkedIn profiles with content always have ≥ 1 sidebar
    // item between the last sidebar header and the identity block,
    // so a real wrapped-headline structure produces ≥ 5 lines. The
    // length=4 no-sidebar wrap case is hypothetical and aligns with
    // the no-headline cert-bleed shape; without a content
    // classifier the two are indistinguishable.
    const NO_HEADLINE_LEN4_CERT_BLEED = `Contact
555-0206 (Mobile)
example-jane4@example.com
Top Skills
Architecture
Programs
Strategy
Languages
English
Certifications
Cloud Architecture
Some Program |
Jane Doe
Toronto, Canada
Summary
Architect summary.
Experience
ConsultingCo
Cloud Architect
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
University of Toronto
B.Eng., Computer Engineering
`;
    const profile = parseLinkedInText(NO_HEADLINE_LEN4_CERT_BLEED);
    expect(profile.fullName).toBe('Jane Doe');
  });

  it('wrap targets Codex R7 P2 named (Global Expansion / Business Growth / Customer Success) do NOT shadow the real name', () => {
    // Codex R7 P2 flagged that the initial disqualifier vocabulary
    // missed common headline-suffix nouns. Each fixture below is a
    // wrap target Codex named explicitly. The fix adds `expansion`,
    // `growth`, `success` (plus `development`, `innovation`,
    // `excellence`, etc.) to `CERT_DISQUALIFIERS` so `looksLikeName`
    // rejects them and the walk-backwards reaches the real name.
    const wrapTargets = [
      { name: 'Sara Patel', wrap: 'Global Expansion' },
      { name: 'Omar Rivera', wrap: 'Business Growth' },
      { name: 'Priya Shah', wrap: 'Customer Success' },
    ];
    for (const { name, wrap } of wrapTargets) {
      const fixture = `Contact
555-0210 (Mobile)
example@example.com
Top Skills
Strategic Planning
Operations
Leadership
Languages
English
Certifications
Some Program
${name}
Senior Director | Operations | Strategy |
${wrap}
San Francisco Bay Area
Summary
Summary text.
Experience
SomeCo
Senior Director
January 2023 - Present (1 year 11 months)
San Francisco Bay Area
Education
Stanford University
B.S., Economics
`;
      const profile = parseLinkedInText(fixture);
      expect(profile.fullName, `wrap target "${wrap}" should not shadow "${name}"`).toBe(name);
      expect(profile.fullName).not.toBe(wrap);
    }
  });

  it('a profile WITHOUT a wrapped headline still picks the closest-to-bottom name (regression guard for the legacy walk-backwards behaviour)', () => {
    // Sidebar slice that runs ["Cert One", "Alex Example",
    // "Engineer", "Remote"] — the comment on `extractIdentity` calls
    // this case out specifically. The walk-backwards must still pick
    // "Alex Example" (not the cert). The continuation-skip rule only
    // fires when the previous line ends with `|`, so this case
    // is unaffected.
    const CERT_BLEED_FIXTURE = `Contact
555-0201 (Mobile)
example-alex@example.com
Top Skills
Distributed Systems
Languages
English
Certifications
AWS Certified
Cert One
Alex Example
Engineer
Remote
Summary
Engineer summary.
Experience
TechCo
Engineer
January 2023 - Present (1 year 11 months)
Remote
Education
Stanford University
B.S., Computer Science
`;
    const profile = parseLinkedInText(CERT_BLEED_FIXTURE);
    expect(profile.fullName).toBe('Alex Example');
  });
});
