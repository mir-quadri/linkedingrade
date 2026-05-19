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
