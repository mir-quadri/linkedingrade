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
              The focused content audit.
            </h1>
            <p className="deck">
              Drop your LinkedIn &ldquo;Save to PDF&rdquo; export and get a graded audit of the 4
              sections recruiters scan first: Headline, About, Current Role, and Career Arc. The
              full 12-section audit is coming soon in the Chrome extension.
            </p>
          </header>
          <AuditFlow />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
