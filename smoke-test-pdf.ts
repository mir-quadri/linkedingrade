/* eslint-disable no-console */
/**
 * Smoke test for the LinkedIn PDF parser. Loads ./Profile.pdf (if present)
 * and runs it through the production pipeline; otherwise re-runs the
 * verbatim pdf-parse output against parseLinkedInText to verify Stage 2 in
 * isolation. Run with:
 *
 *     npx tsx smoke-test-pdf.ts
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLinkedInPdf } from './lib/pdf/parseLinkedInPdf';
import { parseLinkedInText } from './lib/pdf/parseLinkedInText';
import type { ProfileData } from './lib/engine/types';

// Verbatim text that pdf-parse returns for the real LinkedIn export. Used
// as the smoke-test input when ./Profile.pdf isn't checked in (the PDF is
// gitignored). Keeping the text here means the smoke test stays runnable
// in a fresh clone — the regression guard for the original bug.
const VERBATIM_PDF_TEXT = `Contact
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

async function main(): Promise<void> {
  const pdfPath = resolve(process.cwd(), 'Profile.pdf');
  let profile: ProfileData;
  let source: string;
  if (existsSync(pdfPath)) {
    source = `./Profile.pdf (${pdfPath})`;
    const buf = await readFile(pdfPath);
    profile = await parseLinkedInPdf(buf);
  } else {
    source = 'verbatim pdf-parse output (Profile.pdf not present in repo)';
    profile = parseLinkedInText(VERBATIM_PDF_TEXT);
  }

  console.log(`Source: ${source}\n`);
  console.log('=== ProfileData ===');
  console.log(JSON.stringify(profile, null, 2));

  console.log('\n=== Field summary ===');
  console.log(`url:                 ${profile.url || '(empty)'}`);
  console.log(`fullName:            ${profile.fullName ?? '(null)'}`);
  console.log(
    `headline:            [${profile.headline.confidence}] ${profile.headline.data ?? '(null)'}`,
  );
  console.log(
    `about:               [${profile.about.confidence}] ${(profile.about.data ?? '').slice(0, 120)}...`,
  );
  console.log(
    `currentExperience:   [${profile.currentExperience.confidence}] ${
      profile.currentExperience.data
        ? `${profile.currentExperience.data.company} / ${profile.currentExperience.data.title} / ${profile.currentExperience.data.dates}`
        : '(null)'
    }`,
  );
  console.log(
    `experienceHistory:   [${profile.experienceHistory.confidence}] ${
      profile.experienceHistory.data?.length ?? 0
    } entries`,
  );
  for (const e of profile.experienceHistory.data ?? []) {
    console.log(`  - ${e.company} / ${e.title} / ${e.dates} (${e.durationText})`);
  }
  console.log(
    `skills.topThree:     [${profile.skills.confidence}] ${
      profile.skills.data?.topThree.join(', ') ?? '(null)'
    }`,
  );
  console.log(
    `certifications:      [${profile.certifications.confidence}] ${
      profile.certifications.data?.length ?? 0
    } entries`,
  );
  for (const c of profile.certifications.data ?? []) {
    console.log(`  - ${c.name}`);
  }
  console.log(
    `education:           [${profile.education.confidence}] ${
      profile.education.data?.length ?? 0
    } entries`,
  );
  for (const e of profile.education.data ?? []) {
    console.log(`  - ${e.school} / ${e.degree ?? '(no degree)'} / ${e.dates ?? '(no dates)'}`);
  }
  for (const field of ['photo', 'banner', 'featured', 'activity', 'recommendations'] as const) {
    console.log(
      `${field.padEnd(20)} [${profile[field].confidence}] notes="${profile[field].notes ?? ''}"`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
