import type { Metadata } from 'next';

import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import AuditFlow from '../components/audit/AuditFlow';
import AuditFaq from '../components/audit/AuditFaq';
import JsonLd from '../components/JsonLd';
import { AUDIT_FAQ } from '@/lib/faq';
import { auditWebApplicationJsonLd, faqPageJsonLd } from '@/lib/jsonLd';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Free LinkedIn profile audit from your PDF — LinkedInGrade',
  description:
    "Upload your LinkedIn 'Save to PDF' export and get a free letter grade on Headline, About, Current Experience, and Career Arc (25% each), plus top wins and highest-leverage fixes.",
  path: '/audit',
});

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
          <div style={{ marginTop: 64 }}>
            <AuditFaq items={AUDIT_FAQ} />
          </div>
        </div>
        <JsonLd data={[auditWebApplicationJsonLd(), faqPageJsonLd(AUDIT_FAQ, '/audit')]} />
      </main>
      <SiteFooter />
    </>
  );
}
