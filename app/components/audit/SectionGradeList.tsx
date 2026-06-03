import type { SectionScore } from '@/lib/engine/types';

/**
 * Only the fields this list renders. Both the full `SectionScore` and the
 * trimmed preview section (no numeric scores) satisfy it.
 */
export type SectionGradeRow = Pick<
  SectionScore,
  'id' | 'label' | 'letter' | 'oneLineWhy' | 'needsReview' | 'aboveTheFold'
>;

interface Props {
  sections: SectionGradeRow[];
  /** When true the list is blurred for the email-gate preview. */
  blurred?: boolean;
}

/**
 * Tabular section grade list. Each row carries:
 *   - the section label
 *   - a one-line "why" from the scoring engine
 *   - the adjusted-letter grade
 *   - a "*" marker when `needsReview` is set (AI judge unavailable for this
 *     section in the current pipeline — the structural grade is still
 *     surfaced; the qualitative review is pending the B3 AI integration).
 */
export default function SectionGradeList({ sections, blurred }: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          padding: '14px 22px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-sub)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}
        >
          Section grades
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}
        >
          {sections.length} sections
        </span>
      </div>
      <div style={{ filter: blurred ? 'blur(7px)' : undefined, userSelect: blurred ? 'none' : undefined }}>
        {sections.map((s, i) => (
          <div
            key={s.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px',
              alignItems: 'center',
              gap: 16,
              padding: '14px 22px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 500, fontSize: 14, letterSpacing: '-0.005em' }}>{s.label}</span>
                {s.needsReview ? (
                  <span
                    title="Structural grade — qualitative review pending"
                    aria-label="Structural grade only. Qualitative review pending."
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      letterSpacing: '0.04em',
                      color: 'var(--text-3)',
                      border: '1px solid var(--border-2)',
                      borderRadius: 'var(--r-sm)',
                      padding: '1px 5px',
                      lineHeight: 1.4,
                    }}
                  >
                    *
                  </span>
                ) : null}
                {s.aboveTheFold ? (
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      color: 'var(--text-3)',
                      textTransform: 'uppercase',
                    }}
                  >
                    above the fold
                  </span>
                ) : null}
              </div>
              <div style={{ color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.5 }}>
                {s.oneLineWhy}
              </div>
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 22,
                fontWeight: 500,
                textAlign: 'right',
                letterSpacing: '-0.02em',
                color: gradeColor(s.letter),
              }}
            >
              {s.letter}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          padding: '12px 22px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-sub)',
          color: 'var(--text-3)',
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        Sections marked <span className="font-mono" style={{ fontWeight: 500 }}>*</span> are
        structural grades only. The qualitative review (AI judge) is pending — see the
        method note on the home page.
      </div>
    </div>
  );
}

function gradeColor(letter: string): string {
  if (letter.startsWith('A')) return 'var(--success)';
  if (letter.startsWith('B')) return 'var(--text)';
  if (letter.startsWith('C')) return 'var(--warning)';
  return 'var(--accent)';
}
