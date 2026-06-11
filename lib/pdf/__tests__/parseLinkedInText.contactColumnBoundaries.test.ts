import { describe, expect, it } from 'vitest';

import { parseLinkedInText } from '../parseLinkedInText';

/**
 * Regression fixtures for the three contact-column parser bugs fixed in
 * "Fix parser — contact-column section boundaries, name anchor, wrapped
 * education entries".
 *
 * All data here is SYNTHETIC — placeholder names, emails and handles. The
 * fixtures mirror the STRUCTURAL shape of the real production exports that
 * surfaced each bug (Publications/Patents/Honors rendered in the left
 * contact column below Certifications; a pipe-rich headline that wraps to a
 * two-word phrase; education entries whose degree wraps across lines) without
 * committing any real PII.
 */
describe('parseLinkedInText — contact-column section boundaries', () => {
  // Bug 1 + Bug 2 (Erum-shaped): the contact column carries Certifications
  // then a Publications block with MULTI-LINE titles and NO year line, then
  // the identity block. Before the fix the Certifications section ran past
  // its boundary and swallowed the publication titles AND the name/headline,
  // and the name parse picked the wrapped-headline tail.
  const PUBLICATIONS_NO_YEAR = `Contact
555-0301 (Mobile)
example-priya@example.com
www.linkedin.com/in/example-priya
(LinkedIn)
Top Skills
Computer Science
Engineering Management
Systems Engineering
Languages
Urdu
English
Certifications
Project Management and Risk
Analysis
TOGAF 9 Certified
Publications
Navigating Data Privacy in
AI Systems for Regulated Industries
Building Ethical AI Frameworks
For Enterprise Adoption
Priya Anand
Executive Leader | Motorsports | Automation | Venture Capital |
Digital Transformation
Greater Boston Area
Summary
Executive leader with deep operating experience.
Experience
SomeCo
Chief Operating Officer
January 2023 - Present (1 year 11 months)
Greater Boston Area
Education
Wharton School
MBA, Strategy
`;

  it('Bug 1: name anchors on the identity block, not the wrapped-headline tail', () => {
    const profile = parseLinkedInText(PUBLICATIONS_NO_YEAR);
    expect(profile.fullName).toBe('Priya Anand');
    expect(profile.fullName).not.toBe('Digital Transformation');
  });

  it('Bug 1: the full wrapped headline reassembles', () => {
    const profile = parseLinkedInText(PUBLICATIONS_NO_YEAR);
    expect(profile.headline.confidence).toBe('high');
    expect(profile.headline.data).toBe(
      'Executive Leader | Motorsports | Automation | Venture Capital | Digital Transformation',
    );
  });

  it('Bug 2: certifications stop at the Publications boundary — no publication titles, no name', () => {
    const profile = parseLinkedInText(PUBLICATIONS_NO_YEAR);
    expect(profile.certifications.data).toEqual([
      { name: 'Project Management and Risk Analysis', issuer: null, date: null },
      { name: 'TOGAF 9 Certified', issuer: null, date: null },
    ]);
    const certNames = (profile.certifications.data ?? []).map((c) => c.name ?? '');
    expect(certNames).not.toContain('Navigating Data Privacy in');
    expect(certNames).not.toContain('Priya Anand');
    expect(certNames.some((n) => /Publications|Digital Transformation/.test(n))).toBe(false);
  });

  // Bug 2 (Patents variant): the contact column carries a Patents block with
  // patent-number / inventor evidence below Certifications.
  const PATENTS_PROFILE = `Contact
555-0302 (Mobile)
example-anya@example.com
www.linkedin.com/in/example-anya
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
Co-Inventors Listed, Sample Person
2022
Anya Sokolova
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

  it('Bug 2: Patents block is a boundary — name, headline and clean certs', () => {
    const profile = parseLinkedInText(PATENTS_PROFILE);
    expect(profile.fullName).toBe('Anya Sokolova');
    expect(profile.headline.data).toBe(
      'Principal Cryptography Engineer | Building Privacy-Preserving Systems',
    );
    expect(profile.certifications.data).toEqual([
      {
        name: 'Certified Information Systems Security Professional',
        issuer: null,
        date: null,
      },
    ]);
  });

  // Boundary guard: a sidebar item literally named "Patents" (with no real
  // Patents section) must NOT be promoted to a header — it stays a skill.
  it('a Top Skill literally named "Patents" is not promoted to a section boundary', () => {
    const profile = parseLinkedInText(`Contact
555-0303 (Mobile)
example-marcus@example.com
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
`);
    expect(profile.fullName).toBe('Marcus Chen');
    expect(profile.skills.data?.topThree).toEqual([
      'Software Architecture',
      'Patents',
      'Distributed Systems',
    ]);
  });
});

describe('parseLinkedInText — pipe-rich headline ending in a two-word phrase', () => {
  // The wrap target ("Quiet Confidence") is NOT in the cert-disqualifier
  // vocabulary and is not a location — so this case is carried purely by the
  // STRUCTURAL headline-continuation rule (the line above ends with `|`),
  // proving the name anchor does not depend on an enumerated word list.
  const STRUCTURAL_WRAP = `Contact
555-0304 (Mobile)
example-leo@example.com
Top Skills
Strategic Planning
Operations
Public Speaking
Languages
English
Certifications
Some Program
Leo Martins
Founder | Speaker | Investor | Author |
Quiet Confidence
Lisbon, Portugal
Summary
Founder summary.
Experience
SomeCo
Founder
January 2023 - Present (1 year 11 months)
Lisbon, Portugal
Education
University of Lisbon
B.A., Economics
`;

  it('picks the real name above the wrapped headline', () => {
    const profile = parseLinkedInText(STRUCTURAL_WRAP);
    expect(profile.fullName).toBe('Leo Martins');
    expect(profile.fullName).not.toBe('Quiet Confidence');
  });

  it('reassembles the headline including the non-vocabulary wrap target', () => {
    const profile = parseLinkedInText(STRUCTURAL_WRAP);
    expect(profile.headline.data).toBe(
      'Founder | Speaker | Investor | Author | Quiet Confidence',
    );
  });
});

describe('parseLinkedInText — wrapped multi-line education entries', () => {
  // Bug 3: a degree that wraps across two physical lines used to shift every
  // field by one — the wrap continuation ("Management · (2001 - 2003)") was
  // read as the next school, and a standalone date below a wrapped degree
  // ("Engineering" / "2018 - 2022") landed in the wrong entry.
  const WRAPPED_EDUCATION = `Contact
555-0305 (Mobile)
example-john@example.com
Top Skills
Operations
Languages
English
Certifications
Some Program
John Napoli
Operations Executive
New York, United States
Summary
Operations executive summary.
Experience
SomeCo
Operations Executive
January 2023 - Present (1 year 11 months)
New York, United States
Education
Riverside University
Master of Business Administration - Business
Management · (2001 - 2003)
Coastal Institute of Technology
Bachelor of Science in Software
Engineering
2014 - 2018
Hillside College
B.A., Economics (1998 - 2002)
Lakeside University
Diploma in Design
`;

  it('folds wrapped degree lines into the right entry without shifting fields', () => {
    const profile = parseLinkedInText(WRAPPED_EDUCATION);
    expect(profile.education.data).toEqual([
      {
        school: 'Riverside University',
        degree: 'Master of Business Administration - Business Management ·',
        dates: '2001 - 2003',
      },
      {
        school: 'Coastal Institute of Technology',
        degree: 'Bachelor of Science in Software Engineering',
        dates: '2014 - 2018',
      },
      { school: 'Hillside College', degree: 'B.A., Economics', dates: '1998 - 2002' },
      { school: 'Lakeside University', degree: 'Diploma in Design', dates: null },
    ]);
  });

  it('never reads a wrap continuation or a standalone date as a school name', () => {
    const profile = parseLinkedInText(WRAPPED_EDUCATION);
    const schools = (profile.education.data ?? []).map((e) => e.school);
    expect(schools).not.toContain('Management · (2001 - 2003)');
    expect(schools).not.toContain('Engineering');
    expect(schools).not.toContain('2014 - 2018');
  });

  it('does not merge a plain no-date entry into the next entry that has dates', () => {
    const profile = parseLinkedInText(`Contact
555-0306 (Mobile)
example-sidra@example.com
Top Skills
Research
Languages
English
Certifications
Some Program
Sidra Khan
Researcher
Toronto, Canada
Summary
Researcher summary.
Experience
SomeCo
Researcher
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
First University
B.S., Biology
Second University
M.S., Chemistry (2015 - 2017)
`);
    expect(profile.education.data).toEqual([
      { school: 'First University', degree: 'B.S., Biology', dates: null },
      {
        school: 'Second University',
        degree: 'M.S., Chemistry',
        dates: '2015 - 2017',
      },
    ]);
  });
});
