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
 * Compact waitlist label for tight spaces (e.g. secondary hero / pricing).
 * The full WAITLIST_CTA overflows the non-wrapping mobile header on narrow
 * screens, so compact surfaces use this shorter form.
 */
export const WAITLIST_CTA_SHORT = 'Join waitlist';

/**
 * One-line status for the unshipped full extension, reused across the site.
 */
export const EXTENSION_COMING_SOON =
  'The full 12-section Chrome extension is coming soon.';

/**
 * Label for the CTA that points at the live PDF audit (`/audit`). This is the
 * shippable product today, so the homepage + nav lead here.
 */
export const AUDIT_CTA = 'Audit your profile now →';

/**
 * Compact primary audit CTA for nav and hero (no trailing arrow — fits the
 * primary button chrome).
 */
export const AUDIT_CTA_SHORT = 'Audit your profile';

/**
 * Short primary action used on sample / pricing surfaces that already imply
 * the audit destination.
 */
export const AUDIT_CTA_RUN = 'Run yours';

/**
 * Badge on aspirational sample cards that show Skills/Activity/Photo grades
 * the live free PDF audit does not yet deliver.
 */
export const EXTENSION_SAMPLE_BADGE = 'Extension sample · coming soon';
