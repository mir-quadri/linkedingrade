import type { Metadata } from 'next';

/** Canonical origin. Also the root layout's `metadataBase`. */
export const SITE_URL = 'https://linkedingrade.com';
export const SITE_NAME = 'LinkedInGrade';
export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'LinkedInGrade — the honest LinkedIn audit',
} as const;

/** Absolute URL for a site path (`/audit` → `https://linkedingrade.com/audit`). */
export function absoluteUrl(path: string): string {
  return path === '/' ? SITE_URL : new URL(path, SITE_URL).toString();
}

/**
 * Per-page metadata with a canonical URL and matching OG/Twitter cards.
 * Next.js replaces (not merges) a parent's `openGraph`, so every page that
 * sets its own title must restate the image too — this helper does that.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: 'website',
      url: path,
      siteName: SITE_NAME,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
