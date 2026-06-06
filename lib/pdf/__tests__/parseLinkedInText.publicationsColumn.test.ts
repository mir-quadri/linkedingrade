import { describe, expect, it } from 'vitest';

import { parseLinkedInText } from '../parseLinkedInText';

/**
 * Bug class: the LinkedIn "Save to PDF" export renders Publications,
 * Patents, and Honors-Awards in the SAME left sidebar column as
 * Contact / Top Skills / Languages / Certifications. The parser
 * recognises only the first four as sidebar headers, so when the
 * profile has Publications (or Patents, or Honors) the trailing-
 * sidebar boundary stops at `Certifications` and the identity slice
 * grows to include the entire Publications/Patents/Honors block
 * BEFORE the actual name line. Multi-line publication titles + 2-3
 * word author names look enough like a person's name that the
 * backwards walk in `extractIdentity` can pick one and surface it as
 * the profile's `fullName`. The name-suspicion guard
 * (`isSuspiciousName` + `normalizeProfileForPdfAudit`) masks the
 * symptom by blanking `fullName` when the misparse contains pipes /
 * cliché words / too-many-tokens, but the underlying parse stays
 * wrong.
 *
 * Fixtures below mirror the verbatim shape `pdf-parse` produces for
 * a real two-column LinkedIn export: left-column-top-to-bottom first
 * (Contact, Top Skills, Languages, Certifications, **Publications,
 * Patents, Honors-Awards**), then the right column (Name, Headline,
 * Location, Summary, ...). PII is synthesised — no real emails,
 * phones or LinkedIn handles.
 */
describe('parseLinkedInText — Publications/Patents/Honors in the contact column', () => {
  const PUBLICATIONS_PROFILE = `Contact
555-0101 (Mobile)
example@example.com
www.linkedin.com/in/example
(LinkedIn)
Top Skills
Distributed Systems
Machine Learning
Engineering Leadership
Languages
English
French
Certifications
AWS Certified Solutions Architect
Kubernetes Certified Administrator
Publications
Distributed Systems Architecture
Patterns at Cloud Scale
Authors Listed, Erum Khan, More
Names Here
2023
Machine Learning Operations
For Regulated Industries
Authors Listed, Erum Khan
2024
Erum Quadri
Senior Director, Data | Building AI Platforms at Acme | Driving Analytics Strategy
San Francisco Bay Area
Summary
Eight years building developer-facing platforms for fintech and
regulated industries. Currently building observability for payment
rails at a Series B.
Experience
Acme
Senior Director, Data
January 2023 - Present (1 year 11 months)
San Francisco Bay Area
Education
Stanford University
M.S., Computer Science
`;

  const PATENTS_PROFILE = `Contact
555-0102 (Mobile)
example2@example.com
www.linkedin.com/in/example2
(LinkedIn)
Top Skills
Cryptography
Distributed Systems
Languages
English
Certifications
Certified Information Systems Security Professional
Patents
Method And Apparatus For Distributed
Cryptographic Key Management
United States Patent 11,123,456
Co-Inventors Listed, Anna Schmidt
2022
System For Secure Multi-Party
Computation Over Untrusted Networks
United States Patent 11,234,567
2023
Anna Schmidt
Principal Cryptography Engineer | Building Privacy-Preserving Systems
Berlin Metropolitan Area
Summary
Cryptography engineer focused on production-grade privacy systems.
Experience
SomeCorp
Principal Engineer
January 2022 - Present (3 years)
Berlin Metropolitan Area
Education
Technical University of Munich
M.S., Computer Science
`;

  const HONORS_PROFILE = `Contact
555-0103 (Mobile)
example3@example.com
www.linkedin.com/in/example3
(LinkedIn)
Top Skills
Product Strategy
Growth Marketing
Languages
English
Spanish
Certifications
Certified Scrum Product Owner
Honors-Awards
Forbes 30 Under 30 Enterprise Technology
Forbes Media
2022
Industry Leadership Award For Marketing Excellence
Industry Association
2023
Maria Garcia
VP Product Marketing | B2B SaaS | Scaling Go-to-Market
Austin, Texas, United States
Summary
Product marketing leader with a track record of scaling go-to-market
engines at B2B SaaS companies.
Experience
SaaS Co
VP Product Marketing
February 2021 - Present (3 years 9 months)
Austin, Texas, United States
Education
University of Texas at Austin
BBA, Marketing
`;

  it('Publications block in the sidebar does not garble the fullName (bug class — Erum profile shape)', () => {
    const profile = parseLinkedInText(PUBLICATIONS_PROFILE);
    expect(profile.fullName).toBe('Erum Quadri');
    expect(profile.headline.data).toBe(
      'Senior Director, Data | Building AI Platforms at Acme | Driving Analytics Strategy',
    );
  });

  it('Patents block in the sidebar does not garble the fullName', () => {
    const profile = parseLinkedInText(PATENTS_PROFILE);
    expect(profile.fullName).toBe('Anna Schmidt');
    expect(profile.headline.data).toBe(
      'Principal Cryptography Engineer | Building Privacy-Preserving Systems',
    );
  });

  it('lowercase `Honors & awards` variant is recognised — Codex R2 P2 (LinkedIn emits both Title-Case and lowercase `awards`)', () => {
    const HONORS_LOWERCASE_VARIANT = `Contact
555-0109 (Mobile)
example9@example.com
Top Skills
Product Strategy
Languages
English
Certifications
Certified Scrum Product Owner
Honors & awards
Industry Leadership Award
2023
Award Recipient Citation
2022
Anna Schmidt
Director of Product
Berlin, Germany
Summary
Product leader summary.
Experience
SomeCorp
Director of Product
January 2023 - Present (1 year 11 months)
Berlin, Germany
Education
Technical University of Munich
M.S., Computer Science
`;
    const profile = parseLinkedInText(HONORS_LOWERCASE_VARIANT);
    expect(profile.fullName).toBe('Anna Schmidt');
  });

  it('Honors-Awards block in the sidebar does not garble the fullName', () => {
    const profile = parseLinkedInText(HONORS_PROFILE);
    expect(profile.fullName).toBe('Maria Garcia');
    expect(profile.headline.data).toBe(
      'VP Product Marketing | B2B SaaS | Scaling Go-to-Market',
    );
  });

  // NOTE: an earlier draft of this PR pinned "Publications content
  // does NOT pollute Certifications" via a bare `Publications` entry
  // in SECTION_HEADERS. Codex R4 P2 found that bare nouns
  // (Publications / Publication / Patents / Patent / Awards) collide
  // with sidebar items literally named those strings — a Top Skill
  // called "Patents" would otherwise be promoted to a header. The
  // bare nouns are dropped. The cost is that profiles with a
  // Publications block do pollute the adjacent Certifications block;
  // the name parse itself is unaffected (verified by the first three
  // tests above). A future PR can re-add `Publications` with a
  // tighter disambiguation gate (require strict blank-above, OR
  // check that the next line looks like a publication title) when
  // we have a real verifiable failure to test against.

  it('legacy fallback preserves a 4-word name (Codex R1 P2 — `looksLikeName` rejects 4 tokens but the slice IS a valid name)', () => {
    // `looksLikeName` caps at 3 tokens, so this would have been
    // re-rejected by the Round-0 strict-fallback guard. The softer
    // `obviouslyNotAName` check accepts it.
    const FOUR_WORD_NAME = `Contact
555-0106 (Mobile)
example6@example.com
Top Skills
Brand Strategy
Marketing Operations
Engineering Leadership
Certifications
Certified Digital Marketing Professional
Mary Anne Sue Jones
Marketing Strategist
Toronto, Canada
Summary
Some summary.
Experience
Acme
Marketing Strategist
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
University of Toronto
B.A., Communications
`;
    const profile = parseLinkedInText(FOUR_WORD_NAME);
    expect(profile.fullName).toBe('Mary Anne Sue Jones');
  });

  it('legacy fallback preserves a middle-initial name (Codex R1 P2 — `John M. Smith` fails the regex but IS a valid name)', () => {
    // The period after "M" makes `^[A-Z][\p{L}'\-]*$` fail on "M.",
    // so `looksLikeName` rejects this line. Fallback must still
    // emit it as the name.
    const MIDDLE_INITIAL = `Contact
555-0107 (Mobile)
example7@example.com
Top Skills
Securities Litigation
Corporate Governance
Regulatory Compliance
Certifications
Bar Admission, Massachusetts
John M. Smith
Senior Counsel
Boston, Massachusetts, United States
Summary
Counsel summary.
Experience
LawFirm LLP
Senior Counsel
January 2023 - Present (1 year 11 months)
Boston, Massachusetts, United States
Education
Harvard Law School
J.D.
`;
    const profile = parseLinkedInText(MIDDLE_INITIAL);
    expect(profile.fullName).toBe('John M. Smith');
  });

  it('legacy fallback preserves a connector-particle name (Codex R1 P2 — `Juan Carlos de la Cruz` has "de" / "la" connector words)', () => {
    // `looksLikeName` rejects connector words like "de" / "la" / "of"
    // (CONNECTOR_WORDS). For a Spanish/Portuguese name where the
    // particle is intrinsic to the name, the walk-backwards finds no
    // match. The softer `obviouslyNotAName` fallback gate must let
    // this through — connector words are name-internal here, not the
    // pipes / "at" / "&" tokens that indicate a headline.
    const CONNECTOR_NAME = `Contact
555-0108 (Mobile)
example8@example.com
Top Skills
Customer Success
Account Management
Sales Operations
Certifications
Certified Customer Success Manager
Juan Carlos de la Cruz
Customer Success Leader | Scaling B2B SaaS at LatAm Markets
Mexico City, Mexico
Summary
Customer success leader summary.
Experience
SaaS Co
VP Customer Success
January 2023 - Present (1 year 11 months)
Mexico City, Mexico
Education
Universidad Iberoamericana
B.A., Business Administration
`;
    const profile = parseLinkedInText(CONNECTOR_NAME);
    expect(profile.fullName).toBe('Juan Carlos de la Cruz');
  });

  it('legacy fallback preserves a suffixed name with trailing `.` (Codex R5 P2 — `John Smith Jr.` / `Jane Doe Sr.`)', () => {
    // `looksLikeName` rejects any line ending in `.?!:` (sentence /
    // bullet markers). Common dotted suffixes ("Jr.", "Sr.", "M.D.")
    // make the identity line end in `.` — which the strict heuristic
    // declines, sending the parse through the fallback. My R0
    // `obviouslyNotAName` check ALSO had a trailing-`.` rejection,
    // so it would have re-killed the candidate. Narrowed to `?!:`
    // only — periods are name-permissible at the end (Jr./Sr./M.D./
    // Ph.D.). Codex R5 P2.
    const SUFFIXED_NAME = `Contact
555-0112 (Mobile)
example12@example.com
Top Skills
Engineering Leadership
Distributed Systems
Site Reliability
Certifications
AWS Certified Solutions Architect
John Smith Jr.
Engineering Manager | Distributed Systems
Seattle, Washington, United States
Summary
Engineering manager summary.
Experience
TechCo
Engineering Manager
January 2020 - Present (4 years 11 months)
Seattle, Washington, United States
Education
University of Washington
B.S., Computer Science
`;
    const profile = parseLinkedInText(SUFFIXED_NAME);
    expect(profile.fullName).toBe('John Smith Jr.');
  });

  it('headline-fragment fallback returns null name — does not emit a garbled fullName', () => {
    // Degenerate slice that the old legacy fallback would have
    // emitted as a name. The slice between Certifications and Summary
    // ends up as exactly the headline fragment when the column
    // interleaving puts the actual identity block elsewhere in the
    // flat text.
    const DEGENERATE_SLICE = `Contact
555-0105 (Mobile)
example5@example.com
www.linkedin.com/in/example5
(LinkedIn)
Top Skills
Engineering Leadership
Languages
English
Certifications
Senior Director, Data | Building AI Platforms
Summary
Some summary content here.
Experience
Acme
Senior Director
January 2023 - Present (1 year 11 months)
San Francisco
Education
Stanford University
M.S., Computer Science
`;
    const profile = parseLinkedInText(DEGENERATE_SLICE);
    // The OLD parser would have returned the headline fragment as
    // `fullName`. The NEW behaviour: when the legacy fallback would
    // pick a candidate that fails `looksLikeName` (the candidate has
    // pipes / commas / cert-disqualifier words), return null and let
    // the engine's name-suspicion guard render "Your audit" instead
    // of a garbled string.
    expect(profile.fullName).toBeNull();
  });

  it('a Top Skill literally named "Patents" does NOT get promoted to a header (Codex R4 P2 — same class as `Awards`)', () => {
    // IP/law profile with a Top Skill exactly named "Patents" and
    // no real Patents section. Bare-noun `Patents` was originally
    // listed as a section header for the speculative Erum-bleed
    // defence, but it collides with sidebar items of the same name
    // — same class as the `Awards` collision Codex flagged earlier.
    const TOP_SKILL_NAMED_PATENTS = `Contact
555-0111 (Mobile)
example11@example.com
Top Skills
Software Architecture
Patents
Distributed Systems
Marcus Chen
Principal Engineer
San Francisco, California, United States
Summary
IP-focused engineering summary.
Experience
TechCo
Principal Engineer
January 2023 - Present (1 year 11 months)
San Francisco, California, United States
Education
Stanford University
M.S., Computer Science
`;
    const profile = parseLinkedInText(TOP_SKILL_NAMED_PATENTS);
    expect(profile.fullName).toBe('Marcus Chen');
    expect(profile.skills.data?.topThree).toContain('Patents');
    expect(profile.skills.data?.topThree).toContain('Software Architecture');
    expect(profile.skills.data?.topThree).toContain('Distributed Systems');
  });

  it('a Top Skill literally named "Awards" does NOT get promoted to a header (Codex R3 P2 — standalone `Awards` is too broad)', () => {
    // Codex's R3 P2 finding: in lenient mode (real exports with no
    // blank lines between sections) `findHeaders` skips the boundary
    // check. The standalone `Awards` label as a section header would
    // then collide with any sidebar item whose text is exactly
    // "Awards" — a Top Skill, a certification, etc. — and slice the
    // parent section short. Removing the standalone label means a
    // skill called "Awards" stays a skill.
    const TOP_SKILL_NAMED_AWARDS = `Contact
555-0110 (Mobile)
example10@example.com
Top Skills
Brand Strategy
Awards
Marketing Operations
Certifications
Certified Digital Marketing Professional
Sandra Chen
Marketing Strategist
Toronto, Canada
Summary
Marketing summary.
Experience
Acme
Marketing Strategist
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
University of Toronto
B.A., Communications
`;
    const profile = parseLinkedInText(TOP_SKILL_NAMED_AWARDS);
    // The "Awards" skill must NOT be promoted to a header — it should
    // appear as a regular skill in Top Skills, and the name parse
    // should be unaffected.
    expect(profile.fullName).toBe('Sandra Chen');
    expect(profile.skills.data?.topThree).toContain('Awards');
    expect(profile.skills.data?.topThree).toContain('Brand Strategy');
    expect(profile.skills.data?.topThree).toContain('Marketing Operations');
  });

  it('a clean profile (no Publications/Patents/Honors) still parses correctly — regression guard', () => {
    const CLEAN_PROFILE = `Contact
555-0104 (Mobile)
example4@example.com
www.linkedin.com/in/example4
(LinkedIn)
Top Skills
Engineering Leadership
Distributed Systems
Languages
English
Certifications
AWS Certified Solutions Architect
John Smith
Engineering Manager | Distributed Systems at TechCo
Seattle, Washington, United States
Summary
Engineering manager with 12 years of experience.
Experience
TechCo
Engineering Manager
January 2020 - Present (4 years 11 months)
Seattle, Washington, United States
Education
University of Washington
B.S., Computer Science
`;
    const profile = parseLinkedInText(CLEAN_PROFILE);
    expect(profile.fullName).toBe('John Smith');
    expect(profile.headline.data).toBe(
      'Engineering Manager | Distributed Systems at TechCo',
    );
  });
});
