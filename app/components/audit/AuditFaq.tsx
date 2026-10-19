import { useId } from 'react';

import type { FaqItem } from '@/lib/faq';

/**
 * Visible FAQ. Native <details>/<summary> so it's keyboard- and
 * screen-reader-accessible without JS. The same `items` feed the FAQPage
 * JSON-LD on the page, so copy and schema can't drift.
 */
export default function AuditFaq({ items }: { items: readonly FaqItem[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="audit-faq" id="faq">
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
        FAQ
      </div>
      <h2
        id={headingId}
        style={{ margin: '0 0 16px', fontSize: 24, letterSpacing: '-0.02em', fontWeight: 500 }}
      >
        Questions, answered
      </h2>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {items.map((item) => (
          <details
            key={item.id}
            id={`faq-${item.id}`}
            style={{ borderBottom: '1px solid var(--border)', padding: '14px 0' }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: 16 }}>
              {item.question}
            </summary>
            <p
              style={{
                margin: '10px 0 0',
                color: 'var(--text-2)',
                fontSize: 14.5,
                lineHeight: 1.6,
                maxWidth: '70ch',
              }}
            >
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
