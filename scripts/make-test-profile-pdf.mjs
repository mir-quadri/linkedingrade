// Generate a minimal LinkedIn-shaped PDF from a verbatim text fixture
// so we can exercise the /audit upload flow end-to-end against a real PDF
// that pdf-parse can actually read. Output: ./Profile.pdf at the repo root.
// Not committed — the file is gitignored (we don't want to ship a real
// profile PDF in the repo).
//
// Run: node scripts/make-test-profile-pdf.mjs

import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '..', 'Profile.pdf');

const TEXT = `Contact
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
I put AI into production at regulated enterprises. 15+ years across four global banks.
Software engineer by training. Product and transformation leader by experience.
Experience
Citi
Transformation Product Manager
July 2023 - Present (2 years 11 months)
New Jersey, United States
Privilege Solutions LLC
Founder
August 2017 - Present (8 years 10 months)
East Brunswick, NJ
Founded and currently lead a technology advisory practice serving financial services firms and growth-stage startups.
- Advise C-suite and VP-level clients on AI operationalization strategy.
- Develop channel partnerships connecting enterprise AI solutions.
- Support early-stage technology companies as an angel investor.
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
Bachelor of Engineering, Computer Science
St. Mary's Junior College
Intermediate college, Mathematics, Physics, Chemistry
All Saints' High School
High School, High School/Secondary Certificate Programs
`;

const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
doc.pipe(createWriteStream(outPath));
doc.font('Helvetica').fontSize(10);
for (const line of TEXT.split('\n')) {
  if (line === '') {
    doc.moveDown(0.5);
  } else {
    doc.text(line, { lineBreak: true });
  }
}
doc.end();
console.log(`Wrote ${outPath}`);
