import type { MetadataRoute } from 'next';

import { SITE_URL, absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private per-audit share links (also `noindex` on the page) and API
        // endpoints must never be crawled.
        disallow: ['/audit/result/', '/api/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  };
}
