// Shared launch copy. The Chrome extension isn't on the Web Store yet, so the
// public site must not imply it's installable today. Centralizing the
// "join the waitlist" CTA and the "coming soon" line keeps the wording
// consistent and honest everywhere it appears.

/**
 * Label for every CTA that routes to the extension waitlist. There's no Web
 * Store listing behind these yet, so "Install" would be a false promise.
 */
export const WAITLIST_CTA = 'Join the extension waitlist →';

/**
 * One-line status for the unshipped full extension, reused across the site.
 */
export const EXTENSION_COMING_SOON =
  'The full 12-section Chrome extension is coming soon.';

/**
 * Label for the CTA that points at the live PDF audit (`/audit`). This is the
 * shippable product today, so the homepage links here for anyone who wants a
 * grade now rather than only joining the extension waitlist.
 */
export const AUDIT_CTA = 'Audit your profile now →';
