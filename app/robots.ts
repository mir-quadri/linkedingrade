import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // API endpoints are never crawled. /audit/result/* is deliberately
        // NOT disallowed: a blocked URL can still be indexed from links, and
        // a crawler can't see a noindex it isn't allowed to fetch. Those
        // pages are kept out of the index by <meta name="robots"> plus the
        // X-Robots-Tag header set in next.config.ts.
        disallow: ['/api/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
