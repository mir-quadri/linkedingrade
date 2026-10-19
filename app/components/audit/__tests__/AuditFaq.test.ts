import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AuditPage from '@/app/audit/page';
import { AUDIT_FAQ } from '@/lib/faq';

// Render the real /audit page so this covers both the visible FAQ and the
// JSON-LD it emits from the same data.
const html = renderToStaticMarkup(AuditPage());

const decode = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

function jsonLdBlocks(markup: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const parsed = JSON.parse(m[1]!) as Record<string, unknown> | Array<Record<string, unknown>>;
    out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return out;
}

describe('/audit FAQ: one data source for HTML and JSON-LD', () => {
  const blocks = jsonLdBlocks(html);
  const faqPage = blocks.find((b) => b['@type'] === 'FAQPage') as
    | { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
    | undefined;

  it('renders an accessible FAQ section with every question as a <summary>', () => {
    const labelledBy = html.match(/<section aria-labelledby="([^"]+)" class="audit-faq"/)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`<h2 id="${labelledBy}"`);
    const summaries = [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => decode(m[1]!));
    expect(summaries).toEqual(AUDIT_FAQ.map((f) => f.question));
    for (const f of AUDIT_FAQ) expect(decode(html)).toContain(f.answer);
  });

  it('emits FAQPage JSON-LD whose questions and answers match the rendered FAQ exactly', () => {
    expect(faqPage).toBeDefined();
    expect(faqPage!.mainEntity.map((q) => q.name)).toEqual(AUDIT_FAQ.map((f) => f.question));
    expect(faqPage!.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(AUDIT_FAQ.map((f) => f.answer));
  });

  it('emits a free WebApplication with no ratings or reviews', () => {
    const app = blocks.find((b) => b['@type'] === 'WebApplication') as Record<string, unknown> | undefined;
    expect(app).toBeDefined();
    expect(app!.url).toBe('https://linkedingrade.com/audit');
    expect(app!.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(app!.isAccessibleForFree).toBe(true);
    const all = JSON.stringify(blocks);
    expect(all).not.toMatch(/aggregateRating|"review"|ratingValue/i);
  });

  it('covers the required topics', () => {
    const ids = AUDIT_FAQ.map((f) => f.id);
    expect(ids).toEqual([
      'what-it-grades',
      'export-pdf',
      'is-it-free',
      'pdf-and-email',
      'how-long',
      'extension',
      'how-scoring-works',
    ]);
  });
});
