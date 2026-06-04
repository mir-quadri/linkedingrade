'use client';

import Link from 'next/link';
import { useCallback, useId, useRef, useState, type FormEvent, type ChangeEvent } from 'react';

import type { ProfileData, AuditResult } from '@/lib/engine/types';
import type { AuditPreview } from '@/lib/audit/buildPreview';

import ScoreSummary from './ScoreSummary';
import SectionGradeList from './SectionGradeList';
import ExtensionCallout from './ExtensionCallout';
import WinsAndFixes from './WinsAndFixes';
import SelfAssessedBlock from './SelfAssessedBlock';

type Stage = 'upload' | 'parsing' | 'preview' | 'submitting-email' | 'full';

interface FullReport {
  profile: ProfileData;
  audit: AuditResult;
}

// Vercel Functions reject request bodies over 4.5 MB before the route
// handler runs, returning a non-JSON 413 the client can't surface as a
// nice error. The cap below sits well under that, leaving headroom for
// multipart-form overhead. Must stay in sync with MAX_PDF_BYTES in
// `app/api/audit/route.ts`.
const MAX_MB = 4;
const ACCEPT = '.pdf,application/pdf';

export default function AuditFlow() {
  const fileInputId = useId();
  const emailInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<Stage>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [auditId, setAuditId] = useState<string | null>(null);
  const [preview, setPreview] = useState<AuditPreview | null>(null);
  const [fullReport, setFullReport] = useState<FullReport | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailDelivered, setEmailDelivered] = useState<boolean | null>(null);

  const reset = useCallback(() => {
    setStage('upload');
    setUploadError(null);
    setAuditId(null);
    setPreview(null);
    setFullReport(null);
    setResultUrl(null);
    setEmail('');
    setEmailError(null);
    setEmailDelivered(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`PDF is too large. Max ${MAX_MB} MB.`);
      return;
    }
    setStage('parsing');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch('/api/audit', { method: 'POST', body: fd });
      const data = (await resp.json()) as {
        auditId?: string;
        preview?: AuditPreview;
        error?: string;
      };
      if (!resp.ok || !data.auditId || !data.preview) {
        setStage('upload');
        setUploadError(data.error ?? 'Something went wrong. Try again.');
        return;
      }
      setAuditId(data.auditId);
      setPreview(data.preview);
      // fullReport stays null until /api/audit/email succeeds. The upload
      // response intentionally does NOT include the full report so a user
      // can't bypass the email gate via DevTools.
      setFullReport(null);
      setStage('preview');
      // Scroll to the preview so the user sees the result without hunting.
      requestAnimationFrame(() => {
        document.getElementById('audit-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch {
      setStage('upload');
      setUploadError('Network error. Try again.');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  const handleEmailSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!auditId) return;
      setEmailError(null);
      setStage('submitting-email');
      try {
        const resp = await fetch('/api/audit/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auditId, email }),
        });
        const data = (await resp.json()) as {
          success?: boolean;
          emailed?: boolean;
          resultUrl?: string;
          profile?: FullReport['profile'];
          audit?: FullReport['audit'];
          error?: string;
        };
        if (!resp.ok || !data.success || !data.profile || !data.audit) {
          setStage('preview');
          setEmailError(data.error ?? 'Could not submit. Try again.');
          return;
        }
        // The full report payload is gated to this response, so the gate
        // is actually load-bearing — a DevTools inspection of the upload
        // response leaks only the preview.
        setFullReport({ profile: data.profile, audit: data.audit });
        setEmailDelivered(Boolean(data.emailed));
        if (data.resultUrl) setResultUrl(data.resultUrl);
        setStage('full');
        requestAnimationFrame(() => {
          document.getElementById('audit-full')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } catch {
        setStage('preview');
        setEmailError('Network error. Try again.');
      }
    },
    [auditId, email],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      <UploadCard
        stage={stage}
        dragOver={dragOver}
        uploadError={uploadError}
        fileInputId={fileInputId}
        fileInputRef={fileInputRef}
        onFile={handleFile}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onReset={reset}
      />

      {stage !== 'upload' && stage !== 'parsing' && preview ? (
        <div id="audit-result" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* The composite and all 4 grades are revealed pre-gate and are
              byte-identical after the email — they come from `preview` in both
              stages, never from the gated full-report payload, so a grade can
              never change after submission. The email unlocks the *report*
              (top wins, highest-leverage fixes), not the grades. */}
          <ScoreSummary
            composite={preview.composite}
            fullName={preview.fullName}
            nameConfidence={preview.nameConfidence}
            variant={stage === 'full' ? 'full' : 'preview'}
          />
          <div>
            <div
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Your 4 section grades
            </div>
            <SectionGradeList sections={preview.previewSections} />
          </div>
          <ExtensionCallout />

          {stage !== 'full' || !fullReport ? (
            <EmailGate
              email={email}
              onEmail={setEmail}
              emailInputId={emailInputId}
              onSubmit={handleEmailSubmit}
              submitting={stage === 'submitting-email'}
              error={emailError}
            />
          ) : (
            <FullReportView
              auditId={auditId!}
              audit={fullReport.audit}
              resultUrl={resultUrl}
              emailDelivered={emailDelivered}
              onReset={reset}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function UploadCard({
  stage,
  dragOver,
  uploadError,
  fileInputId,
  fileInputRef,
  onFile,
  onDragOver,
  onDragLeave,
  onDrop,
  onReset,
}: {
  stage: Stage;
  dragOver: boolean;
  uploadError: string | null;
  fileInputId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onReset: () => void;
}) {
  const parsing = stage === 'parsing';
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  };
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        background: dragOver ? 'var(--surface-sub)' : 'var(--surface)',
        border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-2)'}`,
        borderRadius: 'var(--r-lg)',
        padding: '36px 28px',
        textAlign: 'center',
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Step 1 · Upload your LinkedIn PDF
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 26, letterSpacing: '-0.015em', fontWeight: 500 }}>
        Drop your LinkedIn &ldquo;Save to PDF&rdquo; export here.
      </h2>
      <p style={{ margin: '0 auto 18px', color: 'var(--text-2)', maxWidth: '52ch', fontSize: 14.5, lineHeight: 1.55 }}>
        On your LinkedIn profile, click <b style={{ color: 'var(--text)', fontWeight: 500 }}>More → Save to PDF</b>,
        then drop the file here. PDF only, up to {MAX_MB} MB.
      </p>
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept={ACCEPT}
        onChange={handleChange}
        disabled={parsing}
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <label htmlFor={fileInputId} className="btn btn-primary btn-lg" style={{ cursor: parsing ? 'wait' : 'pointer' }}>
          {parsing ? 'Reading PDF…' : 'Choose a PDF'}
        </label>
        {stage !== 'upload' && !parsing ? (
          <button type="button" onClick={onReset} className="btn btn-ghost">
            Start over
          </button>
        ) : null}
      </div>
      {uploadError ? (
        <p role="alert" style={{ marginTop: 14, color: 'var(--accent)', fontSize: 13.5 }}>
          {uploadError}
        </p>
      ) : null}
      <p style={{ marginTop: 18, color: 'var(--text-3)', fontSize: 12, maxWidth: '64ch', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
        We process your PDF in memory, then store the parsed result and (if you submit it) your email so we can send the report and improve the audit.
        We don&apos;t sell or share your data. See our{' '}
        <Link href="/privacy" style={{ color: 'var(--text)', borderBottom: '1px solid var(--border-2)' }}>
          privacy policy
        </Link>
        .
      </p>
    </section>
  );
}

function EmailGate({
  email,
  emailInputId,
  onEmail,
  onSubmit,
  submitting,
  error,
}: {
  email: string;
  emailInputId: string;
  onEmail: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <section
      style={{
        background: 'var(--surface-sub)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-lg)',
        padding: '24px 26px',
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Step 2 · Unlock your report
      </div>
      <h3 style={{ margin: '0 0 6px', fontSize: 22, letterSpacing: '-0.015em', fontWeight: 500 }}>
        Your grades are above. Enter your email for the fixes.
      </h3>
      <p style={{ margin: '0 0 16px', color: 'var(--text-2)', fontSize: 14.5, lineHeight: 1.55 }}>
        The email unlocks your top wins and your three highest-leverage fixes — on this page and in your inbox,
        with a permanent link. Your grades won&apos;t change. One email. No newsletter signup, no marketing drip.
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label htmlFor={emailInputId} className="sr-only">
            Email address
          </label>
          <input
            id={emailInputId}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="you@work.com"
            disabled={submitting}
            style={{
              flex: '1 1 240px',
              minWidth: 0,
              background: 'var(--surface)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--r-sm)',
              padding: '13px 14px',
              font: 'inherit',
              fontSize: 15,
              color: 'var(--text)',
            }}
          />
          <button type="submit" disabled={submitting} className="btn btn-primary btn-lg">
            {submitting ? 'Submitting…' : 'Show me the full audit →'}
          </button>
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5 }}>
          By submitting, you agree to receive your audit at this address. We don&apos;t sell or share your email.
        </p>
        {error ? (
          <p role="alert" style={{ color: 'var(--accent)', fontSize: 13, marginTop: 4 }}>
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function FullReportView({
  auditId,
  audit,
  resultUrl,
  emailDelivered,
  onReset,
}: {
  auditId: string;
  audit: AuditResult;
  resultUrl: string | null;
  emailDelivered: boolean | null;
  onReset: () => void;
}) {
  return (
    <div id="audit-full" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
        }}
      >
        Step 3 · Your report
      </div>
      {/* Grades + extension callout are already shown above; the gate adds
          the actionable report: top wins and highest-leverage fixes, plus the
          self-check and the permanent link. */}
      <WinsAndFixes wins={audit.wins} fixes={audit.fixes} />
      <SelfAssessedBlock auditId={auditId} initial={null} />
      <div
        style={{
          padding: '16px 18px',
          background: 'var(--surface-sub)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--r-sm)',
          fontSize: 13.5,
          color: 'var(--text-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {emailDelivered === true ? (
          <div>
            We emailed a copy of this report to your address. If it doesn&apos;t arrive within a few minutes, check spam.
          </div>
        ) : (
          <div>
            We saved your audit. (Email delivery isn&apos;t configured on this environment yet — your report is still
            available at the link below.)
          </div>
        )}
        {resultUrl ? (
          <div className="font-mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Permanent link:{' '}
            <a href={resultUrl} style={{ color: 'var(--text)', borderBottom: '1px solid var(--border-2)' }}>
              {resultUrl}
            </a>
          </div>
        ) : null}
        <div>
          <button type="button" onClick={onReset} className="btn btn-ghost" style={{ marginTop: 4 }}>
            Run another audit
          </button>
        </div>
      </div>
    </div>
  );
}
