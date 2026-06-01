import type { Metadata } from 'next';

import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import AuditFlow from '../components/audit/AuditFlow';

export const metadata: Metadata = {
  title: 'Audit your LinkedIn profile — LinkedInGrade',
  description:
    "Upload your LinkedIn 'Save to PDF' export and get a graded audit: composite score, section grades, top wins, and highest-leverage fixes.",
};

export default function AuditPage() {
  return (
    <>
      <SiteNav />
      <main className="audit-page">
        <div className="container-x">
          <header className="audit-page-head">
            <div className="meta-line">
              <span>§ A — AUDIT</span>
              <span>WEB · PDF UPLOAD · NO INSTALL</span>
            </div>
            <h1>
              Audit your LinkedIn profile, <em>without the extension.</em>
            </h1>
            <p className="deck">
              Drop your LinkedIn &ldquo;Save to PDF&rdquo; export and get a graded audit:
              composite score, section-by-section letter grades, top wins, and your three
              highest-leverage fixes. Same rubric as the Chrome extension — narrower input,
              honest about what it can&apos;t see.
            </p>
          </header>
          <AuditFlow />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
