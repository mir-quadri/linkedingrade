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

// Characters that can't appear in the email-shaped tokens we redact. The
// local part additionally excludes `=` so `key=user@x.com` redacts as
// `key=u***@x***.com`.
//
// Quantifiers are BOUNDED (RFC 5321 limits: local ≤ 64, domain ≤ 253, label
// ≤ 63). With unbounded `+` the domain run (which may contain dots) and the
// trailing `\.` backtrack quadratically on long dotless/`@`-heavy input — a
// ReDoS on log paths that see attacker-controlled bodies.
//
// Not redacted (accepted gaps; loose on purpose otherwise): IP-literal
// domains (`user@[192.0.2.1]`), quoted local parts (`"a b"@x.com`), and
// percent- or otherwise-encoded addresses (`user%40x.com`).
const EMAIL_IN_TEXT =
  /[^\s@<>()[\]{}"',;:=]{1,64}@[^\s@<>()[\]{}"',;:]{1,253}\.[^\s@<>()[\]{}"',;:]{2,63}/gu;

// An address cut off by truncation (no TLD left) at the very end of the
// retained text — redacted so a partial local part can't leak.
const TRAILING_PARTIAL_EMAIL = /[^\s@<>()[\]{}"',;:=]{1,64}@[^\s@<>()[\]{}"',;:]{0,253}$/u;

/** Max characters of input `redactEmails` will scan; the rest is dropped. */
export const REDACT_MAX_INPUT = 2000;

/** Exposed for the ReDoS regression test only. */
export const __EMAIL_IN_TEXT_FOR_TESTS = EMAIL_IN_TEXT;

/**
 * Redact every email-shaped substring in free text before it hits a log —
 * e.g. a provider error body that echoes the submitted address. Each match is
 * replaced with its masked form, or `[email]` when it can't be masked.
 *
 * Input is capped at `REDACT_MAX_INPUT` characters (bounding work on
 * attacker-controlled bodies); longer text is truncated with a marker.
 */
export function redactEmails(text: string): string {
  let input = text;
  let suffix = '';
  if (input.length > REDACT_MAX_INPUT) {
    suffix = `…[truncated ${input.length - REDACT_MAX_INPUT} chars]`;
    input = input.slice(0, REDACT_MAX_INPUT).replace(TRAILING_PARTIAL_EMAIL, '[email]');
  }
  return input.replace(EMAIL_IN_TEXT, (m) => maskEmail(m) ?? '[email]') + suffix;
}
