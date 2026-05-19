import { describe, expect, it } from 'vitest';
import { parseLinkedInText } from '../parseLinkedInText';

const SENIOR_PROFILE = `Contact
www.linkedin.com/in/janedoe (LinkedIn)
jane.doe@example.com
+1 (555) 123-4567

Page 1 of 4

Top Skills
Distributed Systems
Engineering Leadership
Platform Architecture

Languages
English (Native or Bilingual)
Spanish (Professional Working)

Certifications
AWS Certified Solutions Architect - Professional
Kubernetes Certified Administrator

Jane Doe
VP of Engineering @ Acme | Building developer platforms that scale
San Francisco Bay Area

Summary
Engineering leader with 15+ years building developer-platform teams from
seed to public. I obsess over the boring work that earns long-term
trust.What I am doing now: scaling Acme's platform org from 30 to 80.
Reach me at jane.doe@example.com.

Page 2 of 4

Experience
Acme Corp
VP of Engineering
July 2023 - Present (2 years 11 months)
San Francisco, CA
• Scaling the platform org from 30 to 80 engineers across 6 teams.
• Shipped the v2 deploy pipeline that cut p95 deploys from 18 min to 4 min.
• Hired the first staff-level SRE, security and DX leads.

Beta Industries
Director of Platform Engineering
August 2019 - June 2023 (3 years 11 months)
Remote
• Built and ran the platform team supporting 400 product engineers.
• Owned the migration off bare-metal onto a managed k8s footprint.

Gamma Co
Senior Engineering Manager
January 2015 - July 2019 (4 years 7 months)
New York, NY

Delta LLC
Software Engineer
March 2010 - December 2014 (4 years 10 months)
Boston, MA
• Founded the API platform team.

Page 3 of 4

Education
Stanford University
Master of Science in Computer Science (2008 - 2010)
Massachusetts Institute of Technology
Bachelor of Science in Computer Science (2004 - 2008)

Page 4 of 4
`;

describe('parseLinkedInText - senior multi-role profile', () => {
  const profile = parseLinkedInText(SENIOR_PROFILE, {
    extractedAt: '2026-05-19T00:00:00Z',
  });

  it('extracts name, headline and LinkedIn url from Contact', () => {
    expect(profile.fullName).toBe('Jane Doe');
    expect(profile.headline.data).toBe(
      'VP of Engineering @ Acme | Building developer platforms that scale',
    );
    expect(profile.headline.confidence).toBe('high');
    expect(profile.url).toBe('www.linkedin.com/in/janedoe');
  });

  it('captures the full Summary block including the missing-space artefact', () => {
    expect(profile.about.data).toContain('trust.What I am doing now');
    expect(profile.about.confidence).toBe('high');
  });

  it('parses all four experience entries with dates and durations', () => {
    expect(profile.experienceHistory.data).toHaveLength(4);
    const [current, prev, third, last] = profile.experienceHistory.data!;
    expect(current!.company).toBe('Acme Corp');
    expect(current!.title).toBe('VP of Engineering');
    expect(current!.dates).toBe('July 2023 - Present');
    expect(current!.durationText).toBe('2 years 11 months');
    expect(current!.description).toContain('Scaling the platform org');

    expect(prev!.company).toBe('Beta Industries');
    expect(prev!.dates).toBe('August 2019 - June 2023');

    // Entry with no description still parses.
    expect(third!.company).toBe('Gamma Co');
    expect(third!.description).toBeNull();

    expect(last!.company).toBe('Delta LLC');
    expect(last!.description).toContain('Founded the API platform team');
  });

  it('picks the first "Present" role as currentExperience', () => {
    expect(profile.currentExperience.data?.company).toBe('Acme Corp');
    expect(profile.currentExperience.data?.title).toBe('VP of Engineering');
  });

  it('captures Top Skills and Certifications, leaves them clean', () => {
    expect(profile.skills.data?.topThree).toEqual([
      'Distributed Systems',
      'Engineering Leadership',
      'Platform Architecture',
    ]);
    expect(profile.certifications.data).toEqual([
      { name: 'AWS Certified Solutions Architect - Professional', issuer: null, date: null },
      { name: 'Kubernetes Certified Administrator', issuer: null, date: null },
    ]);
  });

  it('parses Education entries with dates parenthesised', () => {
    expect(profile.education.data).toEqual([
      {
        school: 'Stanford University',
        degree: 'Master of Science in Computer Science',
        dates: '2008 - 2010',
      },
      {
        school: 'Massachusetts Institute of Technology',
        degree: 'Bachelor of Science in Computer Science',
        dates: '2004 - 2008',
      },
    ]);
  });

  it('strips "Page N of M" footers from the extracted text', () => {
    expect(profile.about.data ?? '').not.toMatch(/Page \d+ of \d+/);
    expect(profile.experienceHistory.data?.some((e) => /Page \d+ of \d+/.test(e.description ?? '')))
      .toBe(false);
  });

  it('marks fields that the PDF cannot supply as "missing" with a reason', () => {
    for (const field of ['photo', 'banner', 'featured', 'activity', 'recommendations'] as const) {
      expect(profile[field].data).toBeNull();
      expect(profile[field].confidence).toBe('missing');
      expect(profile[field].notes).toBeTruthy();
    }
  });
});

describe('parseLinkedInText - missing descriptions and Present handling', () => {
  const PROFILE = `Contact
www.linkedin.com/in/jsmith (LinkedIn)

Top Skills
TypeScript
React
Node.js

Languages
English

Certifications
Scrum Master

John Smith
Senior Software Engineer
Austin, TX

Summary
Builder.

Experience
Acme
Senior Software Engineer
February 2021 - Present (5 years 3 months)
Austin, TX

Beta
Software Engineer
June 2018 - January 2021 (2 years 8 months)
Remote

Education
University of Texas
B.S. Computer Science (2014 - 2018)
`;

  it('handles a "Present" current role with no description', () => {
    const profile = parseLinkedInText(PROFILE);
    expect(profile.currentExperience.data?.company).toBe('Acme');
    expect(profile.currentExperience.data?.dates).toBe('February 2021 - Present');
    expect(profile.currentExperience.data?.description).toBeNull();
    expect(profile.experienceHistory.data).toHaveLength(2);
  });
});

describe('parseLinkedInText - profile without Certifications', () => {
  it('still recovers name/headline/location when Certifications is absent', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/noah

Top Skills
TypeScript
React
Go

Languages
English (Native or Bilingual)
French (Limited Working)

Noah Mercer
Staff Engineer @ Acme — building developer tools
Brooklyn, NY

Summary
Builder. Mentor. Mostly the former.

Experience
Acme
Staff Engineer
March 2020 - Present (6 years 2 months)
Brooklyn, NY
• Owns the dev tools surface.

Education
NYU
B.S. Computer Science (2012 - 2016)
`);
    expect(profile.fullName).toBe('Noah Mercer');
    expect(profile.headline.data).toBe(
      'Staff Engineer @ Acme — building developer tools',
    );
    expect(profile.certifications.data).toBeNull();
    expect(profile.certifications.confidence).toBe('missing');
  });

  it('does not pull identity lines into the Languages section', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/noah

Top Skills
TypeScript

Languages
English

Noah Mercer
Staff Engineer
Brooklyn, NY

Summary
About.

Experience

Education
`);
    expect(profile.fullName).toBe('Noah Mercer');
    expect(profile.headline.data).toBe('Staff Engineer');
  });
});

describe('parseLinkedInText - grouped same-company roles', () => {
  const PROFILE = `Contact
www.linkedin.com/in/grouped

Top Skills
Leadership
Systems

Languages
English

Certifications
Cert

Pat Group
Senior Engineering Manager
San Francisco Bay Area

Summary
Tenured at Acme across multiple roles.

Experience
Acme
5 years 3 months
Senior Engineering Manager
March 2024 - Present (1 year 3 months)
San Francisco, CA
• Leading the platform group across five teams.
• Shipped the cross-team SLO program.
Engineering Manager
February 2022 - February 2024 (2 years 1 month)
San Francisco, CA
• Built the developer experience team from 0 to 8.
Senior Engineer
March 2020 - January 2022 (1 year 11 months)
Remote

Beta Co
Software Engineer
June 2017 - February 2020 (2 years 9 months)
Boston, MA
• First engineer on the data platform.

Education
MIT
B.S. EECS (2013 - 2017)
`;

  const profile = parseLinkedInText(PROFILE);

  it('attributes every grouped role to the parent company', () => {
    const history = profile.experienceHistory.data!;
    expect(history.length).toBeGreaterThanOrEqual(4);
    const acmeRoles = history.filter((e) => e.company === 'Acme');
    expect(acmeRoles).toHaveLength(3);
    expect(acmeRoles.map((r) => r.title)).toEqual([
      'Senior Engineering Manager',
      'Engineering Manager',
      'Senior Engineer',
    ]);
  });

  it('does not leak the aggregate-duration line into the company field', () => {
    expect(
      profile.experienceHistory.data!.every(
        (e) => !/^\d+\s+years?/i.test(e.company ?? ''),
      ),
    ).toBe(true);
  });

  it('does not leak description-tail lines into subsequent role companies', () => {
    expect(
      profile.experienceHistory.data!.every(
        (e) => !e.company?.startsWith('•') && !/Shipped|Built|first engineer/i.test(e.company ?? ''),
      ),
    ).toBe(true);
  });

  it('picks the grouped "Present" role as current and keeps its description', () => {
    expect(profile.currentExperience.data?.company).toBe('Acme');
    expect(profile.currentExperience.data?.title).toBe(
      'Senior Engineering Manager',
    );
    expect(profile.currentExperience.data?.description).toContain(
      'Leading the platform group',
    );
  });

  it('still parses the non-grouped follow-up company correctly', () => {
    const beta = profile.experienceHistory.data!.find(
      (e) => e.company === 'Beta Co',
    );
    expect(beta).toBeDefined();
    expect(beta?.title).toBe('Software Engineer');
  });
});

describe('parseLinkedInText - exits a group when a bullet description precedes a fresh company', () => {
  it('treats the post-bullets new company as a fresh entry, not a continuation', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/x

Top Skills
A
B
C

Languages
English

Certifications
Cert One

Sample Person
Headline
Location

Summary
S.

Experience
Acme
4 years 2 months
Senior Engineer
March 2023 - Present (2 years 2 months)
Remote
• Owned the platform team's roadmap.
• Shipped multi-region failover.
Engineer
January 2021 - February 2023 (2 years)
Remote
• Built the deploy pipeline that cut p95 deploys by 4x.
Beta Co
Engineer
June 2018 - December 2020 (2 years 7 months)
Boston, MA
• First engineer on data platform.

Education
School
Degree (2014 - 2018)
`);
    const history = profile.experienceHistory.data!;
    const acme = history.filter((e) => e.company === 'Acme');
    const beta = history.filter((e) => e.company === 'Beta Co');
    expect(acme).toHaveLength(2);
    expect(beta).toHaveLength(1);
    expect(beta[0]?.title).toBe('Engineer');
    // The bullet-tail of the prior Acme role must NOT have been re-attributed
    // as a company.
    expect(
      history.every((e) => !e.company?.startsWith('•')),
    ).toBe(true);
  });
});

describe('parseLinkedInText - date-line anchor only matches real LinkedIn date ranges', () => {
  it('ignores description bullets that incidentally contain " - " and parentheses', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/x

Top Skills
A

Languages
English

Certifications
C

Real Person
Headline
City

Summary
S.

Experience
Acme
Senior Engineer
February 2022 - Present (3 years 3 months)
San Francisco, CA
• Reduced latency - improved p95 (35%)
• Migration to k8s - moved 12 services (Q3)

Beta
Engineer
March 2018 - January 2022 (3 years 11 months)
Remote

Education
School
Degree (2014 - 2018)
`);
    const history = profile.experienceHistory.data!;
    // Without the regex tightening, each "• X - Y (Z)" bullet would have
    // anchored as its own date line, creating phantom entries and stealing
    // surrounding lines as company/title.
    expect(history).toHaveLength(2);
    expect(history.map((e) => e.company)).toEqual(['Acme', 'Beta']);
    // The bullets must remain in the description, not get hoisted into the
    // dates/duration fields.
    expect(history[0]?.description).toContain('Reduced latency');
    expect(history[0]?.description).toContain('Migration to k8s');
    expect(history[0]?.dates).toBe('February 2022 - Present');
  });
});

describe('parseLinkedInText - between-jobs profile (no Present role)', () => {
  it('reports currentExperience as missing rather than promoting the latest past role', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/between

Top Skills
A

Languages
English

Certifications
C

Pat Between
Between roles
Brooklyn, NY

Summary
Taking time off.

Experience
Acme
Senior Engineer
February 2020 - November 2024 (4 years 10 months)
Brooklyn, NY
• Owned the platform team.

Beta
Engineer
March 2017 - January 2020 (2 years 11 months)
Remote

Education
School
Degree (2013 - 2017)
`);
    expect(profile.currentExperience.data).toBeNull();
    // Critically, confidence must be NON-degraded so the engine's
    // scoreCurrentExperience treats this as "No current role detected"
    // rather than "Current role could not be extracted — flagged for review".
    expect(profile.currentExperience.confidence).toBe('high');
    expect(profile.currentExperience.notes).toMatch(/no current role/i);
    // History is still populated.
    expect(profile.experienceHistory.data).toHaveLength(2);
    expect(profile.experienceHistory.data?.[0]?.company).toBe('Acme');
  });

  it('keeps confidence "missing" when no experience entries parse at all', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/none

Top Skills
A

Languages
English

Certifications
C

Empty Person
Headline
City

Summary
S.

Experience

Education
School
Degree (2014 - 2018)
`);
    expect(profile.currentExperience.data).toBeNull();
    expect(profile.currentExperience.confidence).toBe('missing');
  });
});

describe('parseLinkedInText - plain-text descriptions inside grouped roles', () => {
  it('keeps continuation roles when the gap looks like description prose, not a new company', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/prose

Top Skills
A

Languages
English

Certifications
C

Plain Prose
Senior Engineer
City

Summary
Tenured across three roles.

Experience
Acme
6 years
Director of Engineering
March 2023 - Present (2 years 2 months)
San Francisco, CA
Led the platform group across five teams
Senior Engineering Manager
January 2021 - February 2023 (2 years 1 month)
San Francisco, CA
Drove the developer experience charter end to end
Senior Engineer
March 2019 - December 2020 (1 year 9 months)
San Francisco, CA

Education
School
Degree (2010 - 2014)
`);
    const history = profile.experienceHistory.data!;
    // All three roles must remain attributed to Acme; the plain-text
    // descriptions ("Led the platform group…", "Drove the developer…")
    // sit in the same structural slot a fresh-entry company line would
    // occupy, so the parser has to distinguish prose from company names.
    expect(history).toHaveLength(3);
    expect(history.every((e) => e.company === 'Acme')).toBe(true);
    expect(history.map((e) => e.title)).toEqual([
      'Director of Engineering',
      'Senior Engineering Manager',
      'Senior Engineer',
    ]);
  });
});

describe('parseLinkedInText - "Current" end-date recognised as current role', () => {
  it('flags a role ending in Current (not Present) as currentExperience', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/c

Top Skills
A

Languages
English

Certifications
C

Curr Person
Headline
City

Summary
S.

Experience
Acme
Engineer
March 2022 - Current (3 years 2 months)
Remote
• Did things.

Education
School
Degree (2014 - 2018)
`);
    expect(profile.currentExperience.data?.company).toBe('Acme');
    expect(profile.currentExperience.confidence).toBe('high');
  });
});

describe('parseLinkedInText - Top Skills as trailing sidebar', () => {
  it('does not leak identity lines into the skills list', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/short

Top Skills
TypeScript

Lone Skill
Senior Engineer
San Francisco Bay Area

Summary
Skills are sparse but that's OK.

Experience
Acme
Senior Engineer
March 2022 - Present (3 years 2 months)
San Francisco, CA

Education
School
Degree (2014 - 2018)
`);
    expect(profile.fullName).toBe('Lone Skill');
    expect(profile.headline.data).toBe('Senior Engineer');
    expect(profile.skills.data?.topThree).toEqual(['TypeScript']);
    // Critically, neither the name nor the headline nor the location bleeds
    // into the skills list.
    expect(profile.skills.data?.topThree).not.toContain('Lone Skill');
    expect(profile.skills.data?.topThree).not.toContain('Senior Engineer');
    expect(profile.skills.data?.topThree).not.toContain(
      'San Francisco Bay Area',
    );
  });
});

describe('parseLinkedInText - group exit without a prior location', () => {
  it('still classifies the next company as a fresh entry when the last grouped role has no location/description', () => {
    const profile = parseLinkedInText(`Contact
www.linkedin.com/in/x

Top Skills
A

Languages
English

Certifications
C

Sample Person
Headline
Location

Summary
S.

Experience
Acme
4 years 2 months
Senior Engineer
March 2023 - Present (2 years 2 months)
Remote
• Owned the platform team's roadmap.
Engineer
January 2021 - February 2023 (2 years 1 month)
Beta Co
Engineer
June 2018 - December 2020 (2 years 7 months)
Boston, MA
• First engineer on data platform.

Education
School
Degree (2014 - 2018)
`);
    const history = profile.experienceHistory.data!;
    const acme = history.filter((e) => e.company === 'Acme');
    const beta = history.filter((e) => e.company === 'Beta Co');
    expect(acme).toHaveLength(2);
    expect(beta).toHaveLength(1);
    expect(beta[0]?.title).toBe('Engineer');
  });
});

describe('parseLinkedInText - graceful degradation', () => {
  it('does not throw on a profile missing optional sections', () => {
    const minimal = `Contact
www.linkedin.com/in/x

Top Skills
A

Languages
English

Certifications
Cert One

Alex Example
Engineer
Remote

Summary

Experience

Education
`;
    const profile = parseLinkedInText(minimal);
    expect(profile.fullName).toBe('Alex Example');
    expect(profile.experienceHistory.data).toBeNull();
    expect(profile.experienceHistory.confidence).toBe('missing');
    expect(profile.education.data).toBeNull();
    expect(profile.about.data).toBeNull();
  });

  it('skips date lines without a company/title pair above them', () => {
    const malformed = `Contact

Top Skills

Languages

Certifications

Test User
Headline
Location

Summary
S

Experience
January 2020 - Present (5 years)
Stray Location
• Stray bullet

Real Co
Engineer
March 2015 - December 2019 (4 years 10 months)
Remote

Education
School
Degree
`;
    const profile = parseLinkedInText(malformed);
    // The orphan date line at the top of Experience has nothing above it,
    // so it must not produce an entry; only the well-formed "Real Co" row does.
    expect(profile.experienceHistory.data).toHaveLength(1);
    expect(profile.experienceHistory.data?.[0]?.company).toBe('Real Co');
  });
});
