import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import SiteFooter from '@/app/components/SiteFooter';
import SiteNav from '@/app/components/SiteNav';
import ScoreSummary from '@/app/components/audit/ScoreSummary';
import SectionGradeList from '@/app/components/audit/SectionGradeList';
import WinsAndFixes from '@/app/components/audit/WinsAndFixes';
import SelfAssessedBlock from '@/app/components/audit/SelfAssessedBlock';
import { getAuditStore } from '@/lib/storage/auditStore';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your audit — LinkedInGrade',
  description: 'Your LinkedIn profile audit on LinkedInGrade.',
  // Do NOT index per-audit result pages — they're personal records, linked
  // from a transactional email rather than from public navigation.
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ auditId: string }>;
}

export default async function AuditResultPage({ params }: PageProps) {
  const { auditId } = await params;
  const store = await getAuditStore();
  const record = await store.get(auditId);
  // Email gate: the auditId is returned to the browser before the email
  // step (the client needs it to submit /api/audit/email). If this route
  // resolved any record by id, a visitor could POST /api/audit, copy the
  // id, and GET this page to bypass the gate entirely — the bug Codex P1
  // flagged. Treat ungated records as not-found so the id alone is never
  // sufficient to retrieve the full report.
  if (!record || !record.email) notFound();
  const { profile, audit, selfReport, createdAt, email } = record;
  return (
    <>
      <SiteNav />
      <main className="audit-page">
        <div className="container-x">
          <header className="audit-page-head">
            <div className="meta-line">
              <span>§ A — AUDIT</span>
              <span>RESULT · {new Date(createdAt).toISOString().slice(0, 10)}</span>
              <span>EMAILED TO {email}</span>
            </div>
            <h1>
              {profile.fullName ? (
                <>Audit for <em>{profile.fullName}.</em></>
              ) : (
                <>Your audit.</>
              )}
            </h1>
            <p className="deck">
              Permanent link. The full grade breakdown, top wins, and highest-leverage fixes.
              Self-assessed sections (photo, banner, activity, recommendations, featured) are
              recorded separately and never folded into the composite.
            </p>
          </header>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <ScoreSummary composite={audit.composite} fullName={profile.fullName} />
            <SectionGradeList sections={audit.sections} />
            <WinsAndFixes wins={audit.wins} fixes={audit.fixes} />
            <SelfAssessedBlock auditId={auditId} initial={selfReport} />
            <div
              style={{
                padding: '16px 18px',
                background: 'var(--surface-sub)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-sm)',
                fontSize: 13.5,
                color: 'var(--text-2)',
              }}
            >
              Want to re-audit?{' '}
              <Link href="/audit" style={{ color: 'var(--text)', borderBottom: '1px solid var(--border-2)' }}>
                Upload a new PDF →
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
