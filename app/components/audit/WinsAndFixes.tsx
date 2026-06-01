import type { AuditResult } from '@/lib/engine/types';

interface Props {
  wins: AuditResult['wins'];
  fixes: AuditResult['fixes'];
}

export default function WinsAndFixes({ wins, fixes }: Props) {
  return (
    <div className="audit-foot-grid">
      <div className="audit-foot-col">
        <h4>Top wins</h4>
        {wins.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
            No standout wins yet — fix the items on the right first.
          </p>
        ) : (
          <ul className="wins">
            {wins.map((w) => (
              <li key={w.sectionId}>
                <span style={{ fontWeight: 500 }}>{w.label}</span>{' '}
                <span className="font-mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>
                  · {w.letter}
                </span>
                <div style={{ color: 'var(--text-2)', fontSize: 13.5, marginTop: 2 }}>
                  {w.why}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="audit-foot-col">
        <h4>Highest-leverage fixes</h4>
        {fixes.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
            Nothing high-leverage to fix — you&apos;re in good shape.
          </p>
        ) : (
          <ol className="fixes">
            {fixes.map((f) => (
              <li key={`${f.sectionId}-${f.targetLetter}`}>
                <span style={{ fontWeight: 500 }}>{f.label}</span>{' '}
                <span className="font-mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>
                  · {f.currentLetter} → {f.targetLetter} · +{f.pointsGain}pt · {f.effort} effort
                </span>
                <div style={{ color: 'var(--text-2)', fontSize: 13.5, marginTop: 2 }}>
                  {f.recommendation}
                </div>
                {f.rewrite ? (
                  <div
                    style={{
                      marginTop: 8,
                      borderLeft: '2px solid var(--border-2)',
                      paddingLeft: 12,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ color: 'var(--text-3)', marginBottom: 2 }}>
                      <span className="font-mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Before
                      </span>{' '}
                      {f.rewrite.before}
                    </div>
                    <div style={{ color: 'var(--text)' }}>
                      <span className="font-mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                        After
                      </span>{' '}
                      {f.rewrite.after}
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
