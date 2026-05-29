import type { CompositeResult } from '@/lib/engine/types';
import { TIER_LABEL } from '@/lib/engine/scoring';

interface Props {
  composite: CompositeResult;
  fullName: string | null;
  /** "preview" trims subtitle / supporting copy for the smaller preview card. */
  variant?: 'preview' | 'full';
}

export default function ScoreSummary({ composite, fullName, variant = 'full' }: Props) {
  const band = letterBand(composite.letter);
  const tier = TIER_LABEL[composite.tier];
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-lg)',
        padding: variant === 'full' ? '28px 28px 24px' : '22px 22px 18px',
        display: 'grid',
        gridTemplateColumns: '148px 1fr',
        gap: 22,
        alignItems: 'center',
      }}
    >
      <ScoreDonut
        letter={composite.letter}
        score={composite.score}
        accentNegative={band === 'bad' || band === 'warn'}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'var(--text-3)',
            textTransform: 'uppercase',
          }}
        >
          {variant === 'preview' ? 'Preview · Composite' : 'Composite grade'}
        </div>
        <div style={{ fontWeight: 500, fontSize: variant === 'full' ? 22 : 18, letterSpacing: '-0.015em' }}>
          {fullName ?? 'Anonymous profile'}
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 14 }}>
          Seniority tier: <b style={{ color: 'var(--text)', fontWeight: 500 }}>{tier}</b>
          {composite.tierAssumed ? (
            <span
              className="font-mono"
              style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}
            >
              (assumed)
            </span>
          ) : null}
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
          {composite.percentileBand
            ? `Percentile band: ${composite.percentileBand}`
            : 'Percentile bands populate once enough audits exist.'}
        </div>
      </div>
    </div>
  );
}

function letterBand(letter: string): 'good' | 'warn' | 'bad' | 'default' {
  if (letter.startsWith('A')) return 'good';
  if (letter.startsWith('B')) return 'default';
  if (letter.startsWith('C')) return 'warn';
  return 'bad';
}

function ScoreDonut({
  letter,
  score,
  accentNegative,
}: {
  letter: string;
  score: number;
  accentNegative: boolean;
}) {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const circ = 2 * Math.PI * 62;
  const dash = circ;
  const offset = circ * (1 - pct);
  const root = letter.slice(0, 1);
  const suffix = letter.slice(1);
  return (
    <div style={{ position: 'relative', width: 148, height: 148, margin: '0 auto' }}>
      <svg
        width={148}
        height={148}
        viewBox="0 0 148 148"
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        <circle cx={74} cy={74} r={62} fill="none" stroke="var(--border)" strokeWidth={10} />
        <circle
          cx={74}
          cy={74}
          r={62}
          fill="none"
          stroke="var(--text)"
          strokeWidth={10}
          strokeDasharray={dash}
          strokeDashoffset={offset}
          strokeLinecap="butt"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 500,
            letterSpacing: '-0.05em',
            lineHeight: 1,
          }}
        >
          {root}
          {suffix ? (
            <sup
              style={{
                fontSize: 28,
                color: accentNegative ? 'var(--accent)' : 'var(--success)',
                fontWeight: 500,
                top: '-0.5em',
              }}
            >
              {suffix}
            </sup>
          ) : null}
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            color: 'var(--text-3)',
            letterSpacing: '0.06em',
            marginTop: 6,
            textTransform: 'uppercase',
          }}
        >
          {score} / 100
        </div>
      </div>
    </div>
  );
}
