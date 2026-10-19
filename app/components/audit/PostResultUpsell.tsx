'use client';

import { useId } from 'react';

import {
  EXTENSION_COMING_SOON,
  POST_RESULT_UPSELL_BODY,
  POST_RESULT_UPSELL_HEADING,
  WAITLIST_CTA_SHORT,
} from '@/lib/copy';
import { prefillEmail } from '@/lib/audit/prefillEmail';

import WaitlistForm from '../WaitlistForm';

interface Props {
  /** Email the visitor gave for this audit, if known. Prefills the form. */
  email?: string | null;
}

/**
 * One honest next step rendered BELOW a delivered free audit (in-page flow
 * after the email gate, and the permanent result page). Reuses the shared
 * Kit waitlist form — no new endpoint, no price, no urgency. Callers must
 * only render this once a real report exists (never on upload, parsing,
 * error, or empty states).
 */
export default function PostResultUpsell({ email }: Props) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-testid="post-result-upsell"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-lg)',
        padding: '22px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
        }}
      >
        Next step · optional
      </div>
      <h2
        id={headingId}
        style={{ margin: 0, fontSize: 20, letterSpacing: '-0.015em', fontWeight: 500 }}
      >
        {POST_RESULT_UPSELL_HEADING}
      </h2>
      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14.5, lineHeight: 1.55 }}>
        {EXTENSION_COMING_SOON} {POST_RESULT_UPSELL_BODY}
      </p>
      <WaitlistForm
        buttonLabel={WAITLIST_CTA_SHORT}
        initialEmail={prefillEmail(email)}
        inputLabel="Email for the extension waitlist"
      />
    </section>
  );
}
