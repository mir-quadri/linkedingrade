// Generate a minimal LinkedIn-shaped PDF from a synthetic text fixture so
// we can exercise the /audit upload flow end-to-end against a real PDF
// that pdf-parse can actually read. Output: ./Profile.pdf at the repo root.
//
// The fixture deliberately uses synthetic placeholder contact and career
// data — never a real person's PII — because this script is committed
// even though the generated PDF is gitignored, and a committed fixture
// becomes part of the public repo history. The structural shapes the
// parser cares about (multi-line headline, wrapped certifications, grouped
// experience, mid-section page artifacts, three-line entries with no
// location or description) are all preserved.
//
// Run: node scripts/make-test-profile-pdf.mjs

import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '..', 'Profile.pdf');

const TEXT = `Contact
+1 (555) 010-0123 (Mobile)
test.user@example.com
www.linkedin.com/in/test-user
(LinkedIn)
test-user.example/links (Personal)
test-user.example/portfolio (Portfolio)
Top Skills
Management Consulting
Project Plans
Executive-level Communication
Languages
English
Spanish
French
German
Japanese
Mandarin
Certifications
Project Management and Risk
Analysis
Amazon Web Services Cloud
Practitioner
Certified Ethical Hacker
Be the Manager People Will Stay With
Foundations of Project Management
Test User
Enterprise Test Profile | I exercise the parser against a realistic
multi-line headline.
Sample City Metropolitan Area
Summary
This is a synthetic summary block written purely to exercise the parser.
It spans several wrapped lines and intentionally avoids any real names,
companies, or events. The parser collapses these line breaks into a
single paragraph for the about field.
Experience
Acme Corp
Transformation Product Manager
July 2023 - Present (2 years 11 months)
Sample City, Sample State
Synthetic Holdings LLC
Founder
August 2017 - Present (8 years 10 months)
Sample Town, ST
Synthetic placeholder description for a founder role.
- First synthetic bullet point about an advisory engagement.
- Second synthetic bullet point about partnerships.
- Third synthetic bullet point about angel investing.
Bigbank & Co.
Senior Vice President - Test Technology Leader
March 2010 - July 2023 (13 years 5 months)
Sample City Metropolitan Area
Synthetic description for the Bigbank role.
Megamedia Inc.
Project Manager
April 2008 - March 2010 (2 years)
Banco Test
Project Tech Lead
April 2007 - April 2008 (1 year 1 month)
Test Consulting Group
Senior Software Consultant
January 2005 - April 2007 (2 years 4 months)
Education
Sample Institute of Technology
Artificial Intelligence and Machine Learning · (December 2022 - March 2023)
Sample University
M.S. Computer Science, Computer Science
Other Sample University
Bachelor of Engineering, Computer Science
Sample Junior College
Intermediate college, Mathematics, Physics, Chemistry
Sample High School
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
