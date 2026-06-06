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

  it('Honors-Awards block in the sidebar does not garble the fullName', () => {
    const profile = parseLinkedInText(HONORS_PROFILE);
    expect(profile.fullName).toBe('Maria Garcia');
    expect(profile.headline.data).toBe(
      'VP Product Marketing | B2B SaaS | Scaling Go-to-Market',
    );
  });

  it('Publications header is recognised as a sidebar — its body does NOT pollute Certifications', () => {
    const profile = parseLinkedInText(PUBLICATIONS_PROFILE);
    // Certifications has 2 cert lines in the fixture; Publications has
    // 4 publication-title lines and 4 author lines and 2 year lines.
    // Pre-fix: Publications was not recognised, so its body would
    // either bleed into Certifications (when Publications appeared
    // BEFORE the identity) or get lost in the identity slice. Post-
    // fix: the 2 actual cert names sit in Certifications and nothing
    // else.
    expect(profile.certifications.data?.map((c) => c.name)).toEqual([
      'AWS Certified Solutions Architect',
      'Kubernetes Certified Administrator',
    ]);
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
