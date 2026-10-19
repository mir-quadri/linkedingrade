import type { FaqItem } from '@/lib/faq';
import { SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo';

/**
 * Schema.org JSON-LD builders. Facts only: no ratings, reviews, or
 * invented stats. `offers.price` is 0 because the PDF audit is free.
 */
type JsonLd = Record<string, unknown>;

export function organizationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/assets/logo.svg'),
    email: 'hello@linkedingrade.com',
  };
}

export function webSiteJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function auditWebApplicationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${absoluteUrl('/audit')}#app`,
    name: 'LinkedInGrade free LinkedIn profile audit',
    url: absoluteUrl('/audit'),
    description:
      'Upload your LinkedIn “Save to PDF” export and get a letter grade on Headline, About, Current Experience, and Career Arc (25% each).',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any (web browser)',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function faqPageJsonLd(items: readonly FaqItem[], path: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${absoluteUrl(path)}#faq`,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/**
 * Serialize for a `<script type="application/ld+json">`. Escapes `<` so a
 * string containing `</script>` can't break out of the tag.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
