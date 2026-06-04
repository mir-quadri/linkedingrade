import type { AuditResult, SectionId, SectionScore } from '@/lib/engine/types';
import { PDF_AUDIT_SECTIONS } from '@/lib/engine/scoring';

/**
 * The sections shown in the pre-email preview: all 4 graded sections of the
 * focused audit, in display order. The composite is the equal-weighted mean of
 * exactly these four, so revealing 3 and hiding 1 would leak the hidden grade
 * by arithmetic (`composite×4 − the 3 shown`). We therefore reveal all four
 * grades up front; the email gate protects the *report* — the top wins and
 * highest-leverage fixes — not the grades. The gate contract (no wins/fixes in
 * the preview payload) is still enforced and tested.
 */
export const PREVIEW_SECTION_IDS: SectionId[] = PDF_AUDIT_SECTIONS.map((s) => s.id);

/**
 * Exactly the section fields the preview UI renders: the label, the letter
 * grade, the one-line why, and the two display markers. The numeric
 * `rawScore`/`adjustedScore` and the `reasons` array are intentionally NOT
 * carried — they're never rendered pre-gate, and shipping them would be a
 * "rendered-nowhere" field in the gated payload.
 */
export type PreviewSection = Pick<
  SectionScore,
  'id' | 'label' | 'letter' | 'oneLineWhy' | 'needsReview' | 'aboveTheFold'
>;

export interface AuditPreview {
  fullName: string | null;
  /** Mirrors `profile.nameConfidence` — 'low' when the name looks misparsed. */
  nameConfidence?: 'high' | 'low';
  composite: AuditResult['composite'];
  /** All 4 graded sections, with PDF display labels (Career Arc, etc.). */
  previewSections: PreviewSection[];
}

export function buildPreview(
  audit: AuditResult,
  fullName: string | null,
  nameConfidence?: 'high' | 'low',
): AuditPreview {
  const labelById = new Map(PDF_AUDIT_SECTIONS.map((s) => [s.id, s.displayLabel]));
  const previewSections: PreviewSection[] = PREVIEW_SECTION_IDS
    .map((id) => audit.sections.find((s) => s.id === id))
    .filter((s): s is SectionScore => Boolean(s))
    .map((s) => ({
      id: s.id,
      label: labelById.get(s.id) ?? s.label,
      letter: s.letter,
      oneLineWhy: s.oneLineWhy,
      needsReview: s.needsReview,
      aboveTheFold: s.aboveTheFold,
    }));
  return { fullName, nameConfidence, composite: audit.composite, previewSections };
}
