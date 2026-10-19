/**
 * Mask an email for display on a page that may be seen by someone other than
 * its owner (the shareable /audit/result/[auditId] permalink). The owner can
 * still recognize it; anyone else gets nothing usable:
 *
 *   mir@gmail.com            → m***@g***.com
 *   a@b.io                   → ***@b***.io   (1-char local part: reveal nothing)
 *   jane@mail.corp.example.co.uk → j***@m***.uk (subdomains collapsed)
 *
 * Returns `null` for anything that isn't a plausible single address, so the
 * caller can fall back to generic copy instead of echoing malformed input
 * (which could itself be the raw value).
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254 || /\s/.test(trimmed)) return null;

  const parts = trimmed.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || !domain) return null;

  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((l) => l.length === 0)) return null;
  const tld = labels[labels.length - 1];
  if (!/^[A-Za-z]{2,}$/.test(tld)) return null;

  // Index by code point, not UTF-16 code unit, so an astral/emoji first
  // character is kept whole instead of leaving a lone surrogate.
  const localChars = Array.from(local);
  const maskedLocal = localChars.length > 1 ? `${localChars[0]}***` : '***';
  const maskedDomain = `${Array.from(labels[0])[0]}***`;
  return `${maskedLocal}@${maskedDomain}.${tld}`;
}

/** Email-shaped substrings (loose on purpose: over-redaction is fine in logs). */
const EMAIL_IN_TEXT = /[^\s@<>()[\]{}"',;:=]+@[^\s@<>()[\]{}"',;:]+\.[^\s@<>()[\]{}"',;:]+/gu;

/**
 * Redact every email-shaped substring in free text before it hits a log —
 * e.g. a provider error body that echoes the submitted address. Each match is
 * replaced with its masked form, or `[email]` when it can't be masked.
 */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_IN_TEXT, (m) => maskEmail(m) ?? '[email]');
}
