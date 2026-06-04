import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import SiteFooter from '@/app/components/SiteFooter';
import SiteNav from '@/app/components/SiteNav';
import ScoreSummary from '@/app/components/audit/ScoreSummary';
import PdfAuditReport from '@/app/components/audit/PdfAuditReport';
import { runPdfAudit } from '@/lib/engine/scoring';
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
  const { selfReport, createdAt, email } = record;
  // New records are stamped `auditMode: 'pdf'` and already carry the focused
  // 4-section audit. Legacy records (saved before this renderer shipped) hold
  // a full 12-section composite/wins/fixes that can't reconcile with the
  // 4-section page — recompute the focused audit from their stored profile so
  // the permanent link stays consistent. (No AI judge is involved yet, so the
  // recompute is lossless.)
  const { profile, audit } =
    record.auditMode === 'pdf'
      ? { profile: record.profile, audit: record.audit }
      : runPdfAudit(record.profile);
  const nameTrusted = profile.fullName && profile.nameConfidence !== 'low';
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
              {nameTrusted ? (
                <>Audit for <em>{profile.fullName}.</em></>
              ) : (
                <>Your audit.</>
              )}
            </h1>
            <p className="deck">
              Permanent link. A graded read of the 4 sections recruiters scan first —
              Headline, About, Current Role, and Career Arc — plus your top wins and
              highest-leverage fixes. The other 8 sections audit in the Chrome extension.
            </p>
          </header>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <ScoreSummary
              composite={audit.composite}
              fullName={profile.fullName}
              nameConfidence={profile.nameConfidence}
            />
            <PdfAuditReport auditId={auditId} audit={audit} selfReport={selfReport} />
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
