import { describe, expect, it } from 'vitest';

import { parseLinkedInText as parseInner } from '../parseLinkedInText';
import { clipPostEducationText } from '../postEducationBoundaries';

// Same pipeline as production (parseLinkedInPdf): clip, then parse.
function parseLinkedInText(raw: string) {
  return parseInner(clipPostEducationText(raw));
}

/**
 * #28 residual: Experience-slice overrun into main-column sections that
 * follow it when Education is omitted (or sit between Experience and
 * Education). All data is SYNTHETIC — placeholder names, emails, handles.
 */

const SIDEBAR = `Contact
555-0501 (Mobile)
example-ravi@example.com
www.linkedin.com/in/example-ravi
(LinkedIn)
Top Skills
Product Strategy
Roadmapping
Stakeholder Management
Languages
English
Certifications
Certified Scrum Product Owner
Ravi Example
Senior Product Manager | Payments
Austin, Texas, United States
Summary
Product manager focused on payments.`;

const EXPERIENCE = `Experience
PayCo
Senior Product Manager
March 2022 - Present (2 years 8 months)
Austin, Texas, United States
• Led checkout redesign that lifted conversion 12%.
LedgerWorks
Product Manager
June 2018 - February 2022 (3 years 9 months)
Remote
• Shipped the invoicing API.`;

const PROJECTS_PLAIN = `Projects
Open Payments Sandbox
Jan 2023 - Present
Associated with PayCo
Built a public sandbox for testing card flows.
Budget Buddy
2020 - 2021
A personal budgeting side project.`;

function expectTwoRealRoles(profile: ReturnType<typeof parseLinkedInText>) {
  expect(profile.fullName).toBe('Ravi Example');
  expect(profile.headline.data).toBe('Senior Product Manager | Payments');
  const roles = profile.experienceHistory.data ?? [];
  expect(roles.map((r) => [r.company, r.title])).toEqual([
    ['PayCo', 'Senior Product Manager'],
    ['LedgerWorks', 'Product Manager'],
  ]);
  expect(profile.currentExperience.data).toMatchObject({
    company: 'PayCo',
    title: 'Senior Product Manager',
    description: '• Led checkout redesign that lifted conversion 12%.',
  });
  const allText = JSON.stringify(roles);
  for (const leak of ['Projects', 'Open Payments Sandbox', 'Budget Buddy', 'Volunteer', 'Red Cross', 'Organizations', 'Courses', 'Honors', 'Jordan', 'Pragmatic', 'Licenses', 'Hindi', 'Guild', 'Fundamentals']) {
    expect(allText).not.toContain(leak);
  }
}

describe('Experience boundaries when Education is omitted (#28 residual)', () => {
  it('(a) Projects with date lines directly after Experience do not leak into roles', () => {
    expectTwoRealRoles(parseLinkedInText(`${SIDEBAR}\n${EXPERIENCE}\n${PROJECTS_PLAIN}\n`));
  });

  it('(b) Projects then Volunteer Experience after Experience', () => {
    expectTwoRealRoles(
      parseLinkedInText(`${SIDEBAR}\n${EXPERIENCE}\n${PROJECTS_PLAIN}
Volunteer Experience
Red Cross
Shelter Volunteer
June 2019 - December 2022 (3 years 7 months)
Austin, Texas, United States
`),
    );
  });

  it('(b2) Volunteer Experience then Projects after Experience', () => {
    expectTwoRealRoles(
      parseLinkedInText(`${SIDEBAR}\n${EXPERIENCE}
Volunteer Experience
Red Cross
Shelter Volunteer
June 2019 - December 2022 (3 years 7 months)
${PROJECTS_PLAIN}
`),
    );
  });

  it.each([
    ['Organizations', 'Organizations\nProduct Guild\nMember'],
    ['Courses', 'Courses\nPayments Fundamentals'],
    ['Honors & Awards', 'Honors & Awards\nPM of the Year'],
    ['Honors (bare)', 'Honors\nPM of the Year\nIssued by PayCo · Dec 2023'],
    ['Licenses & Certifications', 'Licenses & Certifications\nPragmatic Product Management\nPragmatic Institute'],
    ['Languages (bare)', 'Languages\nHindi\nNative or bilingual proficiency'],
    ['Recommendations', 'Recommendations\nJordan Example\n"Ravi is a fantastic PM."'],
  ])('(a) %s after Experience does not leak into roles', (_label, block) => {
    expectTwoRealRoles(parseLinkedInText(`${SIDEBAR}\n${EXPERIENCE}\n${block}\n`));
  });

  it('Projects between Experience and Education is clipped and Education still parses', () => {
    const profile = parseLinkedInText(`${SIDEBAR}\n${EXPERIENCE}\n${PROJECTS_PLAIN}
Education
State University
B.S., Economics (2014 - 2018)
`);
    expectTwoRealRoles(profile);
    expect(profile.education.data).toEqual([
      { school: 'State University', degree: 'B.S., Economics', dates: '2014 - 2018' },
    ]);
  });

  it('(d) a contact-column "Volunteer Experience" label does not clip Summary/Experience', () => {
    const profile = parseLinkedInText(`Contact
555-0502 (Mobile)
example-ravi2@example.com
Top Skills
Product Strategy
Roadmapping
Volunteer Experience
Languages
English
Ravi Example
Senior Product Manager | Payments
Austin, Texas, United States
Summary
Product manager focused on payments.
${EXPERIENCE}
`);
    expectTwoRealRoles(profile);
    expect(profile.about.data).toBe('Product manager focused on payments.');
  });

  it('legit: grouped roles at one company are unaffected', () => {
    const profile = parseLinkedInText(`${SIDEBAR}
Experience
PayCo
4 years 8 months
Senior Product Manager
March 2022 - Present (2 years 8 months)
Austin, Texas, United States
Product Manager
March 2020 - February 2022 (2 years)
Austin, Texas, United States
${PROJECTS_PLAIN}
`);
    expect((profile.experienceHistory.data ?? []).map((r) => [r.company, r.title])).toEqual([
      ['PayCo', 'Senior Product Manager'],
      ['PayCo', 'Product Manager'],
    ]);
  });

  it('legit: a role at a company named "Courses" (role-shaped) is kept', () => {
    const profile = parseLinkedInText(`${SIDEBAR}\n${EXPERIENCE}
Courses
Instructional Designer
January 2016 - May 2018 (2 years 5 months)
Remote
`);
    expect((profile.experienceHistory.data ?? []).map((r) => r.company)).toEqual(['PayCo', 'LedgerWorks', 'Courses']);
  });

  it('legit: a "Projects" description sub-heading with bullets keeps the role intact', () => {
    const profile = parseLinkedInText(`${SIDEBAR}
Experience
PayCo
Senior Product Manager
March 2022 - Present (2 years 8 months)
Austin, Texas, United States
Projects
• Checkout redesign
• Fraud rules engine
LedgerWorks
Product Manager
June 2018 - February 2022 (3 years 9 months)
Remote
`);
    const roles = profile.experienceHistory.data ?? [];
    expect(roles.map((r) => r.company)).toEqual(['PayCo', 'LedgerWorks']);
    expect(roles[0]!.description).toBe('Projects\n• Checkout redesign\n• Fraud rules engine');
  });

  it('legit: a bare "Projects" line mid-description with later roles is not a clip point', () => {
    const profile = parseLinkedInText(`${SIDEBAR}
Experience
PayCo
Senior Product Manager
March 2022 - Present (2 years 8 months)
Austin, Texas, United States
Projects
Checkout redesign and fraud rules engine.
LedgerWorks
Product Manager
June 2018 - February 2022 (3 years 9 months)
Remote
`);
    expect((profile.experienceHistory.data ?? []).map((r) => r.company)).toEqual(['PayCo', 'LedgerWorks']);
  });

  it('(d2) a contact-column Volunteer Experience block above the name is not a clip origin', () => {
    const profile = parseLinkedInText(`Contact
555-0503 (Mobile)
example-ravi3@example.com
Top Skills
Product Strategy
Languages
English
Volunteer Experience
Red Cross
Ravi Example
Senior Product Manager | Payments
Austin, Texas, United States
Summary
Product manager focused on payments.
${EXPERIENCE}
`);
    const roles = profile.experienceHistory.data ?? [];
    expect(roles.map((r) => [r.company, r.title])).toEqual([
      ['PayCo', 'Senior Product Manager'],
      ['LedgerWorks', 'Product Manager'],
    ]);
  });

  // Ambiguous by construction: "Projects / <name> / <date (duration)>" has
  // exactly the shape of a role at an employer literally named "Projects"
  // (the #28 guard test). Telling them apart would need a project-vs-job-
  // title heuristic, which risks dropping real roles. LinkedIn's Projects
  // entries normally show plain dates (no "(duration)"), which case (a)
  // covers; the duration form stays unhandled.
  it.todo(
    'Projects entries whose date lines carry a "(duration)" after Experience, with no Education — indistinguishable from a role at a company named "Projects"',
  );

  // (c) "Projects before Experience" is skipped: LinkedIn's Save-to-PDF main
  // column is fixed-order (Summary → Experience → Education → others), so a
  // fixture for it would not mirror a real export.
});

