import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo';

/**
 * Public, indexable pages only. `/audit/result/*` are private share links
 * and `/api/*` are endpoints — both are excluded here and disallowed in
 * robots.ts. No `lastModified`: we don't track real per-page edit dates and
 * won't invent them.
 */
export const SITEMAP_PATHS = ['/', '/audit', '/privacy', '/terms', '/contact'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({ url: absoluteUrl(path) }));
}
