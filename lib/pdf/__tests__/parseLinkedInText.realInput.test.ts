import { describe, expect, it } from 'vitest';
import { parseLinkedInText } from '../parseLinkedInText';

// Verbatim text returned by pdf-parse against the real LinkedIn "Save to
// PDF" export this regression suite was written for. Every line, blank
// line and page artifact is preserved exactly so the integration test
// exercises the same Stage-2 input the production pipeline sees. The
// regression guards the class of bug that bypassed PR #9's unit tests —
// synthetic fixtures parsed cleanly while a real export produced an
// entirely empty ProfileData.
const REAL_PDF_TEXT = `Contact
2013441510 (Mobile)
mir@mirquadri.com
[www.linkedin.com/in/mirquadri](https://www.linkedin.com/in/mirquadri)
(LinkedIn)
linktr.ee/MirQuadri (Personal)
topmate.io/mirquadri (Portfolio)
Top Skills
Management Consulting
Project Plans
Executive-level Communication
Languages
Urdu
English
Punjabi
Hindi
Telugu
Gujarati
Certifications
Project Management and Risk
Analysis
Amazon Web Services Cloud
Practitioner
Certified Ethical Hacker
Be the Manager People Won't Leave
Foundations of Project Management
Mir Quadri
Enterprise AI & Transformation Leader | I put AI into production at
regulated enterprises.
New York City Metropolitan Area
Summary
I put AI into production at regulated enterprises.Four global banks.
15+ years. I have seen the full cycle: strategy, pilot, scale, and
everything that breaks in between. The hardest part is never the
technology. It is building the governance, the operating model, and
the change management muscle to make adoption stick.What I
bring to organizations:I solve the gap between AI strategy and AI in
production. I build the operating models, governance frameworks,
and decision forums that let regulated institutions move fast without
breaking trust. I bridge the gap between engineering, product, risk,
and the executive table. I deliver outcomes, not activity.50-85%
measured efficiency gains from AI tools I put into production.
Managed platforms processing 1B+ annual transactions at 99.8%
availability. Decision cycles reduced from 6-8 weeks to 2 weeks.
Three enterprise operating model transformations delivered end
to end. AI initiatives that could not justify their value, paused. The
ones that could, scaled.Software engineer by training. Product and
transformation leader by experience. AI practitioner by conviction.I
believe in building things that work, measuring whether they
actually do, and the discipline to shut them down when they do
not.PMP. CSPO. AWS Solutions Architect Professional. FinOps.
MIT AI/ML. Agile. Product.Open to connecting with leaders who
are serious about making AI work inside complex, regulated
organizations.mir@mirquadri.com.
Experience
Citi
Transformation Product Manager
July 2023 - Present (2 years 11 months)
New Jersey, United States
Privilege Solutions LLC
Founder
Page 1 of 3

-- 1 of 3 --

August 2017 - Present (8 years 10 months)
East Brunswick, NJ
Founded and currently lead a technology advisory practice serving financial
services firms and growth-stage startups, specializing in AI strategy, digital
transformation, and enterprise technology operating models.
- Advise C-suite and VP-level clients on AI operationalization strategy, portfolio
governance, and transformation program design
- Develop channel partnerships connecting enterprise AI solutions (robotics,
intelligent automation) to financial services clients
- Support early-stage technology companies as an angel investor and strategic
advisor
JPMorgan Chase & Co.
Senior Vice President - Global Digital Technology Leader
March 2010 - July 2023 (13 years 5 months)
New York City Metropolitan Area
CCB Technology and CCB Product & Experience
Viacom
Project Manager
April 2008 - March 2010 (2 years)
Morgan Stanley
Project Tech Lead
April 2007 - April 2008 (1 year 1 month)
UBS Investment Bank
Senior Software Consultant
January 2005 - April 2007 (2 years 4 months)
Education
Massachusetts Institute of Technology
Artificial Intelligence and Machine Learning · (December 2022 - March 2023)
Bradley University
M.S. Computer Science, Computer Science
Osmania University
Page 2 of 3

-- 2 of 3 --

Bachelor of Engineering, Computer Science
St. Mary's Junior College
Intermediate college, Mathematics, Physics, Chemistry
All Saints' High School
High School, High School/Secondary Certificate Programs
Page 3 of 3

-- 3 of 3 --
`;

// Real identity block from Dr. Shadé Zahrai's actual export. Reproduces two
// classes that broke name extraction: a leading honorific ("Dr.") and an
// accented letter ("é" in "Shadé"), plus the longest wrapped headline seen
// yet (FOUR continuation lines). The sidebar/main scaffolding around the
// identity slice is minimal but real-shaped so findHeaders resolves a
// trailing sidebar header (Certifications) before the first main header
// (Summary) — that's the boundary extractIdentity walks between.
const INTERNATIONAL_NAME_PDF_TEXT = `Contact
shade@example.com
[www.linkedin.com/in/shadezahrai](https://www.linkedin.com/in/shadezahrai)
(LinkedIn)
Top Skills
Leadership Development
Public Speaking
Executive Coaching
Languages
English
Certifications
Awards | Young Leader
Future Leader Scholarship
Dr. Shadé Zahrai
Helping ambitious professionals lead themselves first – so they
can lead everything else better | Award-winning Self-Leadership
Educator to Fortune 500s, Behavioral Researcher | Author, BIG
TRUST | Ex-Lawyer, MBA, PhD
Ko Samui, Surat Thani, Thailand
Summary
Self-leadership educator and behavioral researcher.
Experience
Influenceing
Founder
January 2018 - Present (8 years)
Ko Samui, Surat Thani, Thailand
`;

describe('parseLinkedInText - international name with honorific + 4-line headline (Shadé Zahrai)', () => {
  const profile = parseLinkedInText(INTERNATIONAL_NAME_PDF_TEXT, {
    extractedAt: '2026-06-07T00:00:00Z',
  });

  it('parses the honorific + accented name instead of falling back to "Anonymous"', () => {
    // The bug rendered this profile as "Anonymous profile" because
    // looksLikeName rejected "Dr." (trailing period) and the legacy
    // fallback then promoted a pipe-bearing headline fragment that the
    // suspicion guard cleared to null.
    expect(profile.fullName).toBe('Dr. Shadé Zahrai');
  });

  it('reassembles the full four-line wrapped headline', () => {
    expect(profile.headline.confidence).toBe('high');
    expect(profile.headline.data).toBe(
      'Helping ambitious professionals lead themselves first – so they ' +
        'can lead everything else better | Award-winning Self-Leadership ' +
        'Educator to Fortune 500s, Behavioral Researcher | Author, BIG ' +
        'TRUST | Ex-Lawyer, MBA, PhD',
    );
  });
});

describe('parseLinkedInText - real LinkedIn "Save to PDF" export', () => {
  const profile = parseLinkedInText(REAL_PDF_TEXT, {
    extractedAt: '2026-05-21T00:00:00Z',
  });

  it('extracts the LinkedIn profile URL from the Contact block', () => {
    expect(profile.url).toBe('www.linkedin.com/in/mirquadri');
  });

  it('extracts the full name from between the cert block and the headline', () => {
    expect(profile.fullName).toBe('Mir Quadri');
  });

  it('joins a multi-line headline back into a single string', () => {
    expect(profile.headline.data).toBe(
      'Enterprise AI & Transformation Leader | I put AI into production at regulated enterprises.',
    );
    expect(profile.headline.confidence).toBe('high');
  });

  it('captures the entire Summary block, preserving missing-space quirks', () => {
    expect(profile.about.confidence).toBe('high');
    const about = profile.about.data!;
    expect(about).toContain('I put AI into production at regulated enterprises.');
    // The wrapped-paragraph quirks "production.Four" and "stick.What" come
    // straight from the source PDF and must not be "corrected".
    expect(about).toContain('regulated enterprises.Four global banks.');
    expect(about).toContain('stick.What');
    // The wrapped lines must read as one paragraph.
    expect(about).toContain('Four global banks. 15+ years.');
    // The closing sentence sits on the last wrapped line.
    expect(about).toContain('mir@mirquadri.com.');
  });

  it('picks Citi as the current experience with full metadata', () => {
    const current = profile.currentExperience.data!;
    expect(profile.currentExperience.confidence).toBe('high');
    expect(current.company).toBe('Citi');
    expect(current.title).toBe('Transformation Product Manager');
    expect(current.dates).toBe('July 2023 - Present');
    expect(current.durationText).toBe('2 years 11 months');
    expect(current.description).toBeNull();
  });

  it('parses all six experience entries in order', () => {
    const history = profile.experienceHistory.data!;
    expect(profile.experienceHistory.confidence).toBe('high');
    expect(history).toHaveLength(6);

    expect(history[0]).toMatchObject({
      company: 'Citi',
      title: 'Transformation Product Manager',
      dates: 'July 2023 - Present',
      durationText: '2 years 11 months',
      description: null,
    });

    expect(history[1]!.company).toBe('Privilege Solutions LLC');
    expect(history[1]!.title).toBe('Founder');
    expect(history[1]!.dates).toBe('August 2017 - Present');
    expect(history[1]!.durationText).toBe('8 years 10 months');
    // Privilege's description spans across a page-separator artifact that
    // had to be stripped before section parsing for the entry to recover.
    expect(history[1]!.description).toContain('Founded and currently lead');
    expect(history[1]!.description).toContain('Advise C-suite');
    expect(history[1]!.description).toContain('Develop channel partnerships');
    expect(history[1]!.description).toContain('Support early-stage technology companies');

    // The JPMorgan title MUST contain "Senior Vice President" — this is the
    // downstream seniority signal the audit engine keys off of.
    expect(history[2]!.company).toBe('JPMorgan Chase & Co.');
    expect(history[2]!.title).toContain('Senior Vice President');
    expect(history[2]!.title).toBe(
      'Senior Vice President - Global Digital Technology Leader',
    );
    expect(history[2]!.dates).toBe('March 2010 - July 2023');
    expect(history[2]!.durationText).toBe('13 years 5 months');
    expect(history[2]!.description).toBe(
      'CCB Technology and CCB Product & Experience',
    );

    // Viacom / Morgan Stanley / UBS are 3-line entries (company / title /
    // dates) — no location, no description.
    expect(history[3]).toMatchObject({
      company: 'Viacom',
      title: 'Project Manager',
      dates: 'April 2008 - March 2010',
      durationText: '2 years',
      description: null,
    });
    expect(history[4]).toMatchObject({
      company: 'Morgan Stanley',
      title: 'Project Tech Lead',
      dates: 'April 2007 - April 2008',
      durationText: '1 year 1 month',
      description: null,
    });
    expect(history[5]).toMatchObject({
      company: 'UBS Investment Bank',
      title: 'Senior Software Consultant',
      dates: 'January 2005 - April 2007',
      durationText: '2 years 4 months',
      description: null,
    });
  });

  it('extracts the three Top Skills', () => {
    expect(profile.skills.confidence).toBe('high');
    expect(profile.skills.data?.topThree).toEqual([
      'Management Consulting',
      'Project Plans',
      'Executive-level Communication',
    ]);
  });

  it('reassembles wrapped certifications into five entries', () => {
    expect(profile.certifications.confidence).toBe('high');
    expect(profile.certifications.data).toEqual([
      { name: 'Project Management and Risk Analysis', issuer: null, date: null },
      { name: 'Amazon Web Services Cloud Practitioner', issuer: null, date: null },
      { name: 'Certified Ethical Hacker', issuer: null, date: null },
      { name: "Be the Manager People Won't Leave", issuer: null, date: null },
      { name: 'Foundations of Project Management', issuer: null, date: null },
    ]);
  });

  it('parses all five education entries', () => {
    expect(profile.education.confidence).toBe('high');
    const edu = profile.education.data!;
    expect(edu).toHaveLength(5);

    expect(edu[0]).toEqual({
      school: 'Massachusetts Institute of Technology',
      degree: 'Artificial Intelligence and Machine Learning ·',
      dates: 'December 2022 - March 2023',
    });
    expect(edu[1]).toEqual({
      school: 'Bradley University',
      degree: 'M.S. Computer Science, Computer Science',
      dates: null,
    });
    expect(edu[2]).toEqual({
      school: 'Osmania University',
      degree: 'Bachelor of Engineering, Computer Science',
      dates: null,
    });
    expect(edu[3]).toEqual({
      school: "St. Mary's Junior College",
      degree: 'Intermediate college, Mathematics, Physics, Chemistry',
      dates: null,
    });
    expect(edu[4]).toEqual({
      school: "All Saints' High School",
      degree: 'High School, High School/Secondary Certificate Programs',
      dates: null,
    });
  });

  it('strips page footers and "-- N of M --" separators from extracted content', () => {
    const about = profile.about.data ?? '';
    expect(about).not.toMatch(/Page \d+ of \d+/);
    expect(about).not.toMatch(/-- \d+ of \d+ --/);
    for (const entry of profile.experienceHistory.data ?? []) {
      expect(entry.description ?? '').not.toMatch(/Page \d+ of \d+/);
      expect(entry.description ?? '').not.toMatch(/-- \d+ of \d+ --/);
      expect(entry.company ?? '').not.toMatch(/Page \d+ of \d+/);
      expect(entry.company ?? '').not.toMatch(/-- \d+ of \d+ --/);
    }
    for (const entry of profile.education.data ?? []) {
      expect(entry.school ?? '').not.toMatch(/Page \d+ of \d+/);
      expect(entry.degree ?? '').not.toMatch(/Page \d+ of \d+/);
      expect(entry.school ?? '').not.toMatch(/-- \d+ of \d+ --/);
      expect(entry.degree ?? '').not.toMatch(/-- \d+ of \d+ --/);
    }
  });

  it('keeps fields the PDF cannot supply as "missing" with a note', () => {
    for (const field of ['photo', 'banner', 'featured', 'activity', 'recommendations'] as const) {
      expect(profile[field].data).toBeNull();
      expect(profile[field].confidence).toBe('missing');
      expect(profile[field].notes).toBeTruthy();
    }
  });
});
