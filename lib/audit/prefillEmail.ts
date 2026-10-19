/**
 * Normalize an email the visitor already gave us (the /audit email gate) so it
 * can prefill the post-result waitlist form. Returns '' for anything that
 * isn't a plausible single address, so the field is left empty rather than
 * prefilled with junk. This is a prefill heuristic only — /api/waitlist and
 * Kit remain the source of truth for validation.
 */
export function prefillEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : '';
}
