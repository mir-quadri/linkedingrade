import { describe, expect, it } from 'vitest';

import { parseLinkedInText as parseInner } from '../parseLinkedInText';
import { clipPostEducationText } from '../postEducationBoundaries';

function parseLinkedInText(raw: string) {
  return parseInner(clipPostEducationText(raw));
}

/**
 * Regression fixtures for post-Education section-boundary overrun.
 *
 * Continues the #27 parser stream: Education was the last recognised
 * header, so Volunteer Experience / Projects / Organizations / Courses /
 * Recommendations (standard LinkedIn "Save to PDF" main-column sections
 * after Education) were swallowed into the Education slice and parsed as
 * phantom schools — education field misalignment on a real /audit upload.
 * When Education was omitted, volunteer date-lines were also parsed as
 * phantom Experience jobs.
 *
 * All data here is SYNTHETIC — placeholder names, emails and handles. No
 * real PII.
 */

function scaffold(tail: string): string {
  return `Contact
555-0401 (Mobile)
example-mina@example.com
www.linkedin.com/in/example-mina
(LinkedIn)
Top Skills
Data Analysis
Community Outreach
Public Speaking
Languages
English
Certifications
First Aid Certified
Mina Patel
Community Lead | Data for Good
Toronto, Canada
Summary
Community lead summary.
Experience
SomeCo
Community Lead
January 2023 - Present (1 year 11 months)
Toronto, Canada
${tail}`;
}

describe('parseLinkedInText — post-Education section boundaries', () => {
  const VOLUNTEER_AFTER_EDU = scaffold(`Education
State University
B.S., Biology (2014 - 2018)
Volunteer Experience
Red Cross
Disaster Response Volunteer
January 2020 - Present (4 years)
Toronto, Canada
• Coordinated weekend shelter shifts.
`);

  it('does not parse a volunteer org as an education school', () => {
    const profile = parseLinkedInText(VOLUNTEER_AFTER_EDU);
    expect(profile.education.data).toEqual([
      { school: 'State University', degree: 'B.S., Biology', dates: '2014 - 2018' },
    ]);
    const schools = (profile.education.data ?? []).map((e) => e.school);
    expect(schools).not.toContain('Volunteer Experience');
    expect(schools).not.toContain('Red Cross');
  });

  it('keeps identity and experience intact when Volunteer Experience follows Education', () => {
    const profile = parseLinkedInText(VOLUNTEER_AFTER_EDU);
    expect(profile.fullName).toBe('Mina Patel');
    expect(profile.headline.data).toBe('Community Lead | Data for Good');
    expect(profile.experienceHistory.data).toHaveLength(1);
    expect(profile.experienceHistory.data?.[0]).toMatchObject({
      title: 'Community Lead',
      company: 'SomeCo',
      dates: 'January 2023 - Present',
      durationText: '1 year 11 months',
    });
    // Volunteer "Present" must not become a second current role.
    expect(profile.currentExperience.data?.company).toBe('SomeCo');
    expect(profile.currentExperience.data?.title).toBe('Community Lead');
  });

  it('does not parse a Projects block after Education as schools', () => {
    const profile = parseLinkedInText(scaffold(`Education
State University
B.S., Biology (2014 - 2018)
Projects
Open Source Clinic Mapper
Built a volunteer clinic map for three cities.
`));
    expect(profile.education.data).toEqual([
      { school: 'State University', degree: 'B.S., Biology', dates: '2014 - 2018' },
    ]);
    const schools = (profile.education.data ?? []).map((e) => e.school);
    expect(schools).not.toContain('Projects');
    expect(schools).not.toContain('Open Source Clinic Mapper');
  });

  it('does not parse Organizations or Courses after Education as schools', () => {
    const profile = parseLinkedInText(scaffold(`Education
State University
B.S., Biology (2014 - 2018)
Organizations
Biology Student Association
Member
Courses
Intro to Epidemiology
Associated with State University
`));
    expect(profile.education.data).toEqual([
      { school: 'State University', degree: 'B.S., Biology', dates: '2014 - 2018' },
    ]);
    const schools = (profile.education.data ?? []).map((e) => e.school);
    expect(schools).not.toContain('Organizations');
    expect(schools).not.toContain('Biology Student Association');
    expect(schools).not.toContain('Courses');
    expect(schools).not.toContain('Intro to Epidemiology');
  });

  it('does not parse a recommender name after Education as a school', () => {
    const profile = parseLinkedInText(scaffold(`Education
State University
B.S., Biology (2014 - 2018)
Recommendations
Jordan Lee
"Mina is a fantastic community lead."
`));
    expect(profile.education.data).toEqual([
      { school: 'State University', degree: 'B.S., Biology', dates: '2014 - 2018' },
    ]);
    const schools = (profile.education.data ?? []).map((e) => e.school);
    expect(schools).not.toContain('Recommendations');
    expect(schools).not.toContain('Jordan Lee');
  });

  // Courses can appear before Projects in LinkedIn's profile order. The
  // clip must stop at whichever terminator comes first, not wait for the
  // SECTION_HEADERS search order.
  it('clips Education at the earliest terminator even when Courses precedes Projects', () => {
    const profile = parseLinkedInText(scaffold(`Education
State University
B.S., Biology (2014 - 2018)
Courses
Intro to Epidemiology
Projects
Open Source Clinic Mapper
`));
    expect(profile.education.data).toEqual([
      { school: 'State University', degree: 'B.S., Biology', dates: '2014 - 2018' },
    ]);
    const schools = (profile.education.data ?? []).map((e) => e.school);
    expect(schools).not.toContain('Courses');
    expect(schools).not.toContain('Intro to Epidemiology');
    expect(schools).not.toContain('Projects');
  });

  it('a Top Skill literally named "Projects" stays a skill and does not steal Education', () => {
    const profile = parseLinkedInText(`Contact
555-0402 (Mobile)
example-mina2@example.com
Top Skills
Projects
Data Analysis
Community Outreach
Languages
English
Certifications
First Aid Certified
Mina Patel
Community Lead | Data for Good
Toronto, Canada
Summary
Community lead summary.
Experience
SomeCo
Community Lead
January 2023 - Present (1 year 11 months)
Toronto, Canada
Education
State University
B.S., Biology (2014 - 2018)
`);
    expect(profile.skills.data?.topThree).toEqual([
      'Projects',
      'Data Analysis',
      'Community Outreach',
    ]);
    expect(profile.education.data).toEqual([
      { school: 'State University', degree: 'B.S., Biology', dates: '2014 - 2018' },
    ]);
    expect(profile.fullName).toBe('Mina Patel');
  });

  it('when Education is omitted, Volunteer Experience does not become a phantom job', () => {
    const profile = parseLinkedInText(`Contact
555-0403 (Mobile)
example-mina3@example.com
Top Skills
Data Analysis
Community Outreach
Public Speaking
Languages
English
Certifications
First Aid Certified
Mina Patel
Community Lead | Data for Good
Toronto, Canada
Summary
Community lead summary.
Experience
SomeCo
Community Lead
January 2023 - Present (1 year 11 months)
Toronto, Canada
Volunteer Experience
Red Cross
Disaster Response Volunteer
June 2019 - December 2022 (3 years 7 months)
Toronto, Canada
`);
    expect(profile.education.confidence).toBe('missing');
    expect(profile.experienceHistory.data).toHaveLength(1);
    expect(profile.experienceHistory.data?.[0]?.company).toBe('SomeCo');
    expect(profile.experienceHistory.data?.[0]?.title).toBe('Community Lead');
    const companies = (profile.experienceHistory.data ?? []).map((e) => e.company);
    expect(companies).not.toContain('Red Cross');
    expect(companies).not.toContain('Volunteer Experience');
    expect(profile.fullName).toBe('Mina Patel');
  });

  // A company literally named "Projects" must not truncate Experience when
  // Education is omitted — why Projects is clip-only for Education, not a
  // SECTION_HEADERS entry.
  it('a company named Projects is not treated as a section header', () => {
    const profile = parseLinkedInText(`Contact
555-0404 (Mobile)
example-mina4@example.com
Top Skills
Data Analysis
Languages
English
Certifications
First Aid Certified
Mina Patel
Engineer
Toronto, Canada
Summary
Engineer summary.
Experience
Projects
Staff Engineer
January 2023 - Present (1 year 11 months)
Toronto, Canada
`);
    expect(profile.experienceHistory.data).toHaveLength(1);
    expect(profile.experienceHistory.data?.[0]).toMatchObject({
      title: 'Staff Engineer',
      company: 'Projects',
      dates: 'January 2023 - Present',
      durationText: '1 year 11 months',
    });
    expect(profile.fullName).toBe('Mina Patel');
  });
});
