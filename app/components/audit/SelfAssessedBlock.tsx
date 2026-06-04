'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { SelfReport } from '@/lib/storage/auditStore';

import { EXTENSION_URL } from './ExtensionCallout';

type Field = keyof Omit<SelfReport, 'submittedAt'>;
type Status = 'idle' | 'submitting' | 'saved' | 'error';

const QUESTIONS: Array<{
  field: Field;
  label: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    field: 'photo',
    label: 'Is your profile photo a clear, professional headshot?',
    options: [
      { value: 'yes', label: 'Yes — recent, clear, professional' },
      { value: 'somewhat', label: 'Somewhat — old, awkward crop, or casual' },
      { value: 'no', label: "No photo, or it's the default avatar" },
    ],
  },
  {
    field: 'banner',
    label: 'Do you have a custom banner image?',
    options: [
      { value: 'yes', label: 'Yes — custom and intentional' },
      { value: 'generic', label: 'Generic LinkedIn template / stock image' },
      { value: 'no', label: 'No banner set' },
    ],
  },
  {
    field: 'activity',
    label: 'Is your activity feed active in the last 30 days?',
    options: [
      { value: 'yes', label: 'Yes — posting / commenting weekly' },
      { value: 'occasional', label: 'Occasional — a few items per month' },
      { value: 'no', label: 'No public activity in the last 30 days' },
    ],
  },
  {
    field: 'recommendations',
    label: 'Do you have 3+ recommendations from former colleagues?',
    options: [
      { value: 'yes', label: '3 or more recent recommendations' },
      { value: '1-2', label: '1 or 2 recommendations' },
      { value: 'none', label: 'No recommendations yet' },
    ],
  },
  {
    field: 'featured',
    label: 'Do you have a Featured section with portfolio links?',
    options: [
      { value: 'yes', label: 'Yes — Featured section is populated' },
      { value: 'no', label: "No Featured section, or it's empty" },
    ],
  },
];

interface Props {
  auditId: string;
  initial: SelfReport | null;
}

export default function SelfAssessedBlock({ auditId, initial }: Props) {
  const [answers, setAnswers] = useState<Partial<Record<Field, string>>>(() => {
    if (!initial) return {};
    return {
      photo: initial.photo ?? undefined,
      banner: initial.banner ?? undefined,
      activity: initial.activity ?? undefined,
      recommendations: initial.recommendations ?? undefined,
      featured: initial.featured ?? undefined,
    };
  });
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      const resp = await fetch('/api/audit/self-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditId, selfReport: answers }),
      });
      const data = (await resp.json()) as { success?: boolean; error?: string };
      if (!resp.ok || !data.success) {
        setStatus('error');
        setError(data.error ?? 'Could not save your responses.');
        return;
      }
      setStatus('saved');
    } catch {
      setStatus('error');
      setError('Network error. Try again.');
    }
  }

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderLeft: '3px solid var(--warning)',
        borderRadius: 'var(--r-lg)',
        padding: '22px 24px',
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
        Quick self-check
      </div>
      <h3 style={{ margin: '0 0 6px', fontSize: 22, letterSpacing: '-0.015em', fontWeight: 500 }}>
        5 things this audit can&apos;t see.
      </h3>
      <p style={{ margin: '0 0 18px', color: 'var(--text-2)', fontSize: 14.5, lineHeight: 1.55 }}>
        Your answers aren&apos;t graded — but if you answer{' '}
        <b style={{ color: 'var(--text)', fontWeight: 500 }}>&ldquo;No&rdquo;</b> to any, those are
        signals to address before applying for senior roles.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {QUESTIONS.map((q) => (
          <fieldset key={q.field} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend
              style={{
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 8,
                padding: 0,
                color: 'var(--text)',
              }}
            >
              {q.label}
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((o) => (
                <label
                  key={o.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 14,
                    color: 'var(--text-2)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name={q.field}
                    value={o.value}
                    checked={answers[q.field] === o.value}
                    onChange={() => setAnswers((a) => ({ ...a, [q.field]: o.value }))}
                    disabled={status === 'submitting'}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="btn btn-primary"
          >
            {status === 'submitting' ? 'Saving…' : status === 'saved' ? 'Saved · save again' : 'Save self-assessment'}
          </button>
          {status === 'saved' ? (
            <span
              role="status"
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
              }}
            >
              recorded · not in composite
            </span>
          ) : null}
          {status === 'error' && error ? (
            <span role="alert" style={{ color: 'var(--accent)', fontSize: 13 }}>
              {error}
            </span>
          ) : null}
        </div>
      </form>
      <p style={{ margin: '16px 0 0', color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.55 }}>
        Want these scored?{' '}
        <Link href={EXTENSION_URL} style={{ color: 'var(--text)', borderBottom: '1px solid var(--border-2)' }}>
          Install the Chrome extension. Install →
        </Link>
      </p>
    </section>
  );
}
