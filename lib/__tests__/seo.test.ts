import { describe, expect, it } from 'vitest';

import robots from '@/app/robots';
import sitemap, { SITEMAP_PATHS } from '@/app/sitemap';
import { metadata as resultMetadata } from '@/app/audit/result/[auditId]/page';
import { metadata as auditMetadata } from '@/app/audit/page';
import { metadata as homeMetadata } from '@/app/page';
import { metadata as privacyMetadata } from '@/app/privacy/page';
import { AUDIT_FAQ } from '@/lib/faq';
import {
  auditWebApplicationJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  webSiteJsonLd,
} from '@/lib/jsonLd';
import { absoluteUrl } from '@/lib/seo';

describe('robots + sitemap', () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];

  it('disallows private result share links and the API for every crawler', () => {
    const star = rules.find((x) => x.userAgent === '*')!;
    expect(star.disallow).toEqual(expect.arrayContaining(['/audit/result/', '/api/']));
    expect(r.sitemap).toBe('https://linkedingrade.com/sitemap.xml');
  });

  it('lists only public pages, all absolute on linkedingrade.com, none private', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual(SITEMAP_PATHS.map(absoluteUrl));
    for (const u of urls) {
      expect(u.startsWith('https://linkedingrade.com')).toBe(true);
      expect(u).not.toMatch(/\/audit\/result|\/api\//);
    }
    // No invented modification dates.
    for (const e of sitemap()) expect(e.lastModified).toBeUndefined();
  });
});

describe('page metadata', () => {
  it('marks /audit/result/* noindex, nofollow', () => {
    expect(resultMetadata.robots).toEqual({ index: false, follow: false });
  });

  it.each([
    ['/', homeMetadata],
    ['/audit', auditMetadata],
    ['/privacy', privacyMetadata],
  ] as const)('%s has title, description, canonical, and OG with image + matching url', (path, m) => {
    expect(m.title).toBeTruthy();
    expect(m.description).toBeTruthy();
    expect(m.alternates?.canonical).toBe(path);
    const og = m.openGraph as { url?: string; images?: unknown[]; title?: string };
    expect(og.url).toBe(path);
    expect(og.title).toBe(m.title);
    expect(og.images?.length).toBe(1);
  });
});

describe('structured data', () => {
  it('Organization and WebSite point at the canonical origin', () => {
    expect(organizationJsonLd()).toMatchObject({ '@type': 'Organization', url: 'https://linkedingrade.com' });
    expect(webSiteJsonLd()).toMatchObject({ '@type': 'WebSite', url: 'https://linkedingrade.com' });
  });

  it('escapes < so data cannot close the script tag', () => {
    expect(serializeJsonLd({ x: '</script><b>' })).not.toContain('</script>');
  });
});

describe('forbidden claims', () => {
  const corpus = [
    JSON.stringify(AUDIT_FAQ),
    serializeJsonLd([
      organizationJsonLd(),
      webSiteJsonLd(),
      auditWebApplicationJsonLd(),
      faqPageJsonLd(AUDIT_FAQ, '/audit'),
    ]),
    JSON.stringify([homeMetadata, auditMetadata, privacyMetadata]),
  ].join('\n');

  it.each([
    ['SOC 2', /SOC ?2/i],
    ['live paid plans', /Start Pro|\$\d|per month|\/mo\b|subscribe now|upgrade to/i],
    ['dated launch / beta', /\bQ[1-4]\s*·?\s*20\d\d|\bbeta\b|launch(es|ing)? (on|in) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d\d)/i],
    ['ratings / reviews', /aggregateRating|ratingValue|reviewCount|\d(\.\d)? ?stars?\b/i],
    ['invented usage stats', /\b\d[\d,.]*\+? ?(users|profiles audited|audits run|customers)\b|trusted by/i],
    ['available-now extension', /extension is (now )?(available|live)|install (it|now) from the Chrome Web Store/i],
  ])('contains no %s', (_label, re) => {
    expect(corpus).not.toMatch(re);
  });
});
