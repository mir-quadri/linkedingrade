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

  // Codex R2 P2 (this PR): publication metadata beyond the title is optional
  // on LinkedIn, so a real Publications block can be TITLE-ONLY — no year
  // lines, no author lines, and wrap points that don't land on a stop word.
  // The anchored-position rule (a Certifications/Languages/Honors header was
  // already matched, so the scan is past the Top Skills collision zone) must
  // still promote the label.
  it('Bug 2: a title-only Publications block (no years/authors/stop-word wraps) is still a boundary', () => {
    const profile = parseLinkedInText(`Contact
555-0309 (Mobile)
example-priya2@example.com
Top Skills
Computer Science
Engineering Management
Systems Engineering
Languages
English
Certifications
TOGAF 9 Certified
Publications
Distributed Systems Architecture
Patterns at Cloud Scale
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
`);
    expect(profile.fullName).toBe('Priya Anand');
    expect(profile.headline.data).toBe(
      'Executive Leader | Motorsports | Automation | Venture Capital | Digital Transformation',
    );
    expect(profile.certifications.data).toEqual([
      { name: 'TOGAF 9 Certified', issuer: null, date: null },
    ]);
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

  // Codex R3 P2 (this PR): a CERTIFICATION literally named "Publications"
  // at the end of the cert list must not open the anchored gate off the
  // identity content below it — the line under the label is the person's
  // name, which the title-shaped check rejects. Identity stays intact and
  // the cert content is not truncated. (NOTE: the 1-word "Publications"
  // line folding into the previous cert title is the pre-existing
  // reassembleCertifications wrap behaviour, not part of this gate.)
  it('a certification literally named "Publications" does not open the gate on identity content', () => {
    const profile = parseLinkedInText(`Contact
555-0312 (Mobile)
example-erum3@example.com
Top Skills
Negotiation
Strategy
Operations
Languages
English
Certifications
Strategic Negotiation Program
Publications
Erum Tariq
Operations Director | Supply Chain | Logistics
Dubai, United Arab Emirates
Summary
Operations summary.
Experience
SomeCo
Operations Director
January 2023 - Present (1 year 11 months)
Dubai, United Arab Emirates
Education
American University of Sharjah
B.S., Industrial Engineering
`);
    expect(profile.fullName).toBe('Erum Tariq');
    expect(profile.headline.data).toBe(
      'Operations Director | Supply Chain | Logistics',
    );
    const certText = (profile.certifications.data ?? [])
      .map((c) => c.name ?? '')
      .join(' ');
    expect(certText).toContain('Strategic Negotiation Program');
    expect(certText).toContain('Publications');
  });

  // Codex R1 P2 (this PR): multi-word skill names below a skill literally
  // named "Patents" must NOT count as section evidence. Complete noun-phrase
  // items ("Intellectual Property Strategy") don't break mid-phrase the way
  // wrapped publication/patent titles do, so the gate stays closed and the
  // skills list survives intact.
  it('a "Patents" skill followed by multi-word skills is not promoted — skills list survives', () => {
    const profile = parseLinkedInText(`Contact
555-0307 (Mobile)
example-marcus2@example.com
Top Skills
Patents
Intellectual Property Strategy
Technology Transfer Negotiations
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
      'Patents',
      'Intellectual Property Strategy',
      'Technology Transfer Negotiations',
    ]);
  });

  // Codex R7 P2 (this PR): with NO Languages/Certifications anchor, a Top
  // Skill named "Patents" must not be promoted by evidence that actually
  // lives in the identity / Summary block below it (a standalone year, an
  // author-looking line, or a summary line wrapping after "in"/"of"). The
  // evidence scan stops at the sidebar-block boundary (next header or the
  // name line), so the skills list survives.
  it('a "Patents" skill is not promoted by year/wrap evidence that lives in the identity/summary block', () => {
    const profile = parseLinkedInText(`Contact
555-0318 (Mobile)
example-raj@example.com
Top Skills
Software Architecture
Patents
Distributed Systems
Raj Mehta
Principal Engineer
San Francisco, California, United States
Summary
Building reliable systems since 2009 and investing in
the next generation of infrastructure.
Experience
TechCo
Principal Engineer
January 2023 - Present (1 year 11 months)
San Francisco, California, United States
Education
Stanford University
M.S., Computer Science
`);
    expect(profile.fullName).toBe('Raj Mehta');
    expect(profile.skills.data?.topThree).toEqual([
      'Software Architecture',
      'Patents',
      'Distributed Systems',
    ]);
  });

  // Codex R8 P2 (this PR): with NO Languages/Certifications anchor, the SOFT
  // mid-phrase-wrap signal must not promote a Top Skill named "Publications".
  // A long skill can wrap at a stop word ("Machine Learning in" /
  // "Production") and mimic a wrapped publication title, so only HARD
  // evidence (year/patent#/authors) promotes anchor-free. The skill stays a
  // skill and the list is not truncated.
  it('a no-anchor "Publications" skill is not promoted by a stop-word-wrapping skill below it', () => {
    const profile = parseLinkedInText(`Contact
555-0319 (Mobile)
example-priya3@example.com
Top Skills
Data Engineering
Publications
Machine Learning in
Production
Priya Anand
Principal Data Scientist
Seattle, Washington, United States
Summary
Data scientist summary.
Experience
DataCo
Principal Data Scientist
January 2023 - Present (1 year 11 months)
Seattle, Washington, United States
Education
University of Washington
M.S., Statistics
`);
    expect(profile.fullName).toBe('Priya Anand');
    expect(profile.skills.data?.topThree).toEqual([
      'Data Engineering',
      'Publications',
      'Machine Learning in',
    ]);
  });

  // Codex R10 P2 (this PR): a real no-anchor Publications block can OPEN with
  // a short Title-Case title that passes looksLikeName ("Data Privacy")
  // before the hard year line. The hard-evidence scan must not stop at that
  // name-shaped title — it has to reach "2023" to promote the header. Once
  // promoted, Publications becomes the trailing sidebar, so its label/title/
  // year do NOT leak into the Top Skills list and the identity parses
  // cleanly.
  it('hard evidence (year) below a name-shaped publication title still promotes Publications (no anchor)', () => {
    const profile = parseLinkedInText(`Contact
555-0320 (Mobile)
example-erum4@example.com
Top Skills
Data Engineering
Machine Learning
Publications
Data Privacy
2023
Erum Khan
Senior Data Scientist | Machine Learning Platforms
San Francisco Bay Area
Summary
Data scientist summary.
Experience
DataCo
Senior Data Scientist
January 2023 - Present (1 year 11 months)
San Francisco Bay Area
Education
Stanford University
M.S., Computer Science
`);
    expect(profile.fullName).toBe('Erum Khan');
    expect(profile.headline.data).toBe(
      'Senior Data Scientist | Machine Learning Platforms',
    );
    // Publications was promoted to a boundary, so its label / title / year
    // never leak into Top Skills.
    expect(profile.skills.data?.topThree).toEqual([
      'Data Engineering',
      'Machine Learning',
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

  // Codex R1 P2 (this PR): the continuation skip must be constrained to the
  // wrapped-headline shape. A single-pipe-ended cert title ("Some Program |")
  // above the real name, with another name-shaped cert ("Dale Carnegie")
  // higher in the slice, must still resolve to the closest-to-bottom identity
  // name — not skip it and surface the certification.
  it('a pipe-ended cert above the name does not skip the real name onto an earlier name-shaped cert', () => {
    const profile = parseLinkedInText(`Contact
555-0308 (Mobile)
example-jane5@example.com
Top Skills
Project Management
Process Improvement
Compliance
Languages
English
Certifications
Dale Carnegie
Some Program |
Jane Doe
Senior Engineer
Toronto, Canada
Summary
S.
Experience
BankCo
Senior Engineer
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
University of Toronto
B.Comm., Finance
`);
    expect(profile.fullName).toBe('Jane Doe');
    expect(profile.fullName).not.toBe('Dale Carnegie');
  });

  // Codex R4 P2 (this PR): a NO-HEADLINE profile whose trailing cert is a
  // pipe-rich PRODUCT list ("AWS | Azure | GCP |") puts the real name at
  // slice.length - 2. The skip must not fire there: a real headline L1
  // carries job-title vocabulary in its segments, a product list does not.
  it('a pipe-rich product-list cert above the name (no headline) does not skip the real name', () => {
    const profile = parseLinkedInText(`Contact
555-0314 (Mobile)
example-jane6@example.com
Top Skills
Cloud Computing
Infrastructure as Code
Site Reliability
Languages
English
Certifications
Dale Carnegie
AWS | Azure | GCP |
Jane Doe
Toronto, Canada
Summary
S.
Experience
CloudCo
Site Reliability Engineer
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
University of Toronto
B.A.Sc., Computer Engineering
`);
    expect(profile.fullName).toBe('Jane Doe');
    expect(profile.fullName).not.toBe('Dale Carnegie');
  });

  // Codex R5 P2 (this PR): a wrapped headline whose L1 labels all fall
  // OUTSIDE the disqualifier vocabulary ("Speaker | Investor | Author |")
  // must still trigger the continuation skip — the discriminator is the
  // segment SHAPE (Title-Case words vs an acronym-dominant product list),
  // not an enumerable word list.
  it('a non-vocabulary pipe-rich wrapped headline still yields the real name, not the wrap tail', () => {
    const profile = parseLinkedInText(`Contact
555-0315 (Mobile)
example-nina@example.com
Top Skills
Public Speaking
Angel Investing
Writing
Languages
English
Certifications
Some Program
Nina Gomez
Speaker | Investor | Author |
Quiet Confidence
Lisbon, Portugal
Summary
Speaker summary.
Experience
SomeCo
Keynote Speaker
January 2023 - Present (1 year 11 months)
Lisbon, Portugal
Education
University of Lisbon
B.A., Communications
`);
    expect(profile.fullName).toBe('Nina Gomez');
    expect(profile.fullName).not.toBe('Quiet Confidence');
    expect(profile.headline.data).toBe(
      'Speaker | Investor | Author | Quiet Confidence',
    );
  });

  // Codex R6 P2 (this PR): a SINGLE-pipe headline that wraps to a
  // non-vocabulary tail. A headline only spills its tail onto a second line
  // when L1 nearly filled the column, so a LONG single-pipe L1 is the
  // wrap signal (a short stray-pipe cert like "Some Program |" is not, and
  // a short single-pipe headline would never wrap in the first place).
  it('a long single-pipe wrapped headline yields the real name, not the wrap tail', () => {
    const profile = parseLinkedInText(`Contact
555-0316 (Mobile)
example-marco@example.com
Top Skills
Public Speaking
Coaching
Writing
Languages
English
Certifications
Some Program
Marco Silva
Helping ambitious founders build calm, focused companies |
Quiet Confidence
Lisbon, Portugal
Summary
Coach summary.
Experience
SomeCo
Executive Coach
January 2023 - Present (1 year 11 months)
Lisbon, Portugal
Education
University of Lisbon
B.A., Psychology
`);
    expect(profile.fullName).toBe('Marco Silva');
    expect(profile.fullName).not.toBe('Quiet Confidence');
    expect(profile.headline.data).toBe(
      'Helping ambitious founders build calm, focused companies | Quiet Confidence',
    );
  });

  // Guard for the symmetric case: a SHORT single-pipe stray-pipe cert above
  // the real name (no headline) must NOT trigger the wrap skip — the real
  // name at slice.length - 2 stays, it is not traded for an earlier
  // name-shaped cert. This is the boundary the WRAP_L1_MIN_LENGTH threshold
  // protects.
  it('a short single-pipe cert above the name (no headline) does not skip the real name', () => {
    const profile = parseLinkedInText(`Contact
555-0317 (Mobile)
example-jane7@example.com
Top Skills
Project Management
Process Improvement
Compliance
Languages
English
Certifications
Dale Carnegie
Some Program |
Jane Doe
Toronto, Canada
Summary
S.
Experience
BankCo
Compliance Officer
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
University of Toronto
B.Comm., Finance
`);
    expect(profile.fullName).toBe('Jane Doe');
    expect(profile.fullName).not.toBe('Dale Carnegie');
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

  // Codex R2 P2 (this PR): an undated entry followed by a school-only entry
  // whose next line is its date range must NOT fold the second school into
  // the first entry's degree. The short-degree length guard and the
  // school-name guard both block the false wrap fold; the degree-less entry
  // keeps its dates in the dates field, not the degree field.
  it('does not merge the next school into an undated degree (standalone-date shape)', () => {
    const profile = parseLinkedInText(`Contact
555-0310 (Mobile)
example-sidra2@example.com
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
2015 - 2017
`);
    expect(profile.education.data).toEqual([
      { school: 'First University', degree: 'B.S., Biology', dates: null },
      { school: 'Second University', degree: null, dates: '2015 - 2017' },
    ]);
  });

  // Acronym schools ("MIT") after a LONG undated degree line: the
  // school-name guard's all-caps token check keeps the fold from firing
  // even when the length guard alone would allow it.
  it('does not fold an acronym school into a long undated degree above it', () => {
    const profile = parseLinkedInText(`Contact
555-0311 (Mobile)
example-omar2@example.com
Top Skills
Research
Languages
English
Certifications
Some Program
Omar Haddad
Researcher
Boston, Massachusetts, United States
Summary
Researcher summary.
Experience
SomeCo
Researcher
January 2023 - Present (1 year 11 months)
Boston, Massachusetts, United States
Education
First University
Bachelor of Science in Computer Science
MIT
2011 - 2015
`);
    expect(profile.education.data).toEqual([
      {
        school: 'First University',
        degree: 'Bachelor of Science in Computer Science',
        dates: null,
      },
      { school: 'MIT', degree: null, dates: '2011 - 2015' },
    ]);
  });

  // Codex R3 P2 (this PR): keyword-less multi-word school names ("General
  // Assembly", "HEC Paris") after a long undated degree must not be folded
  // as wrap tails. A genuine wrap tail is a phrase fragment (single word or
  // lowercase run-on); a multi-word Title-Case line is the next school.
  it('does not fold a keyword-less multi-word school into a long undated degree', () => {
    const profile = parseLinkedInText(`Contact
555-0313 (Mobile)
example-lina2@example.com
Top Skills
Research
Languages
English
Certifications
Some Program
Lina Park
Researcher
Paris, France
Summary
Researcher summary.
Experience
SomeCo
Researcher
January 2023 - Present (1 year 11 months)
Paris, France
Education
First University
Bachelor of Science in Computer Science
General Assembly
2015 - 2017
Second University
Master of Business Administration
HEC Paris
2018 - 2020
`);
    expect(profile.education.data).toEqual([
      {
        school: 'First University',
        degree: 'Bachelor of Science in Computer Science',
        dates: null,
      },
      { school: 'General Assembly', degree: null, dates: '2015 - 2017' },
      {
        school: 'Second University',
        degree: 'Master of Business Administration',
        dates: null,
      },
      { school: 'HEC Paris', degree: null, dates: '2018 - 2020' },
    ]);
  });

  // Codex R11 P2 (this PR): a degree that wraps MID-PHRASE on a stop word
  // ("Bachelor of Business Administration in") must fold its multi-word
  // Title-Case continuation ("Management Information Systems") as the degree
  // tail, not split it into a bogus second school. The mid-phrase-wrap
  // signal on the degree line distinguishes this from the R3 "complete
  // degree / next school" shape.
  it('folds a multi-word wrapped degree tail when the degree line ends mid-phrase', () => {
    const profile = parseLinkedInText(`Contact
555-0321 (Mobile)
example-nadia@example.com
Top Skills
Research
Languages
English
Certifications
Some Program
Nadia Rahman
Researcher
Dhaka, Bangladesh
Summary
Researcher summary.
Experience
SomeCo
Researcher
January 2023 - Present (1 year 11 months)
Dhaka, Bangladesh
Education
First University
Bachelor of Business Administration in
Management Information Systems
2014 - 2018
`);
    expect(profile.education.data).toEqual([
      {
        school: 'First University',
        degree: 'Bachelor of Business Administration in Management Information Systems',
        dates: '2014 - 2018',
      },
    ]);
  });
});
