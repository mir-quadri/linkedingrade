import Link from 'next/link';

import { WAITLIST_CTA } from '@/lib/copy';

/**
 * Where the waitlist CTA points. The Chrome Web Store listing isn't live yet
 * (pre-launch), so this routes to the homepage where the waitlist lives. Swap
 * to the store URL once the extension ships.
 */
export const EXTENSION_URL = '/';

/**
 * Consolidated callout for the 8 sections the focused PDF audit parses but
 * does NOT grade. Replaces the 8 individual "could not be extracted — flagged
 * for review" rows with a single honest block: these are audited at full
 * depth in the Chrome extension.
 */
export default function ExtensionCallout() {
  return (
    <section
      style={{
        background: 'var(--surface-sub)',
        border: '1px solid var(--border-2)',
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
        Not graded here
      </div>
      <h3 style={{ margin: '0 0 6px', fontSize: 20, letterSpacing: '-0.015em', fontWeight: 500 }}>
        8 more sections in the Chrome extension
      </h3>
      <p style={{ margin: '0 0 14px', color: 'var(--text-2)', fontSize: 14.5, lineHeight: 1.55 }}>
        Photo, Banner, Featured, Activity, Recommendations, Skills, Education,
        Keyword Health — all audited at full depth in the Chrome extension,
        coming soon.
      </p>
      <Link href={EXTENSION_URL} className="btn btn-primary">
        {WAITLIST_CTA}
      </Link>
    </section>
  );
}
