import type { SectionId } from '@/lib/engine/types';

interface SectionMeta {
  id: SectionId;
  label: string;
  weight: number; // 0-1; sums to 1.0
  aboveTheFold: boolean;
  // Display order matches RUBRIC.md § 2 numbering (01..12)
  order: number;
}

/**
 * Section weights — directly from RUBRIC.md § 2.
 * Weights expressed as a fraction of 1.0; they sum to 1.0.
 *
 * "Partial" above-the-fold sections in the rubric (About, Current Experience,
 * Featured) are treated as above-the-fold for the heat-map view, since the top
 * of those sections is visible before scrolling. This matches the rubric's
 * "above-the-fold = ~60% of grade" rationale.
 */
export const SECTIONS: readonly SectionMeta[] = [
  { id: 'headline', label: 'Headline', weight: 0.16, aboveTheFold: true, order: 1 },
  { id: 'photo', label: 'Photo', weight: 0.08, aboveTheFold: true, order: 2 },
  { id: 'banner', label: 'Banner', weight: 0.05, aboveTheFold: true, order: 3 },
  { id: 'about', label: 'About', weight: 0.18, aboveTheFold: true, order: 4 },
  { id: 'currentExperience', label: 'Current Experience', weight: 0.14, aboveTheFold: true, order: 5 },
  { id: 'experienceHistory', label: 'Experience (full history)', weight: 0.10, aboveTheFold: false, order: 6 },
  { id: 'skills', label: 'Skills', weight: 0.08, aboveTheFold: false, order: 7 },
  { id: 'featured', label: 'Featured', weight: 0.05, aboveTheFold: true, order: 8 },
  { id: 'activity', label: 'Activity', weight: 0.06, aboveTheFold: false, order: 9 },
  { id: 'recommendations', label: 'Recommendations', weight: 0.04, aboveTheFold: false, order: 10 },
  { id: 'education', label: 'Education & Certifications', weight: 0.03, aboveTheFold: false, order: 11 },
  { id: 'keywordHealth', label: 'Keyword & Buzzword Health', weight: 0.03, aboveTheFold: false, order: 12 },
];

export function sectionMeta(id: SectionId): SectionMeta {
  const m = SECTIONS.find((s) => s.id === id);
  if (!m) throw new Error(`Unknown section id: ${id}`);
  return m;
}

export function totalWeight(): number {
  return SECTIONS.reduce((sum, s) => sum + s.weight, 0);
}

interface PdfAuditSection {
  id: SectionId;
  weight: number; // composite weight in the focused PDF audit (sums to 1.0)
  /**
   * Display label for the PDF "Sample Audit". The section ID is unchanged so
   * storage, judge requests and the extension engine all keep using the
   * canonical id; only the user-facing card label differs.
   */
  displayLabel: string;
}

/**
 * The focused 4-section "Sample Audit" the PDF flow grades. These are the
 * sections a recruiter scans first; each carries equal 25% weight in the PDF
 * composite. The other 8 sections are still parsed and returned on the audit
 * object (for reference / the future full report) but DO NOT contribute to
 * the PDF composite — they are surfaced as a single "audit in the Chrome
 * extension" callout instead.
 *
 * Display order matches the order recruiters scan: Headline → About →
 * Current Role → Career Arc.
 */
export const PDF_AUDIT_SECTIONS: readonly PdfAuditSection[] = [
  { id: 'headline', weight: 0.25, displayLabel: 'Headline' },
  { id: 'about', weight: 0.25, displayLabel: 'About' },
  { id: 'currentExperience', weight: 0.25, displayLabel: 'Current Experience' },
  { id: 'experienceHistory', weight: 0.25, displayLabel: 'Career Arc' },
];

export const PDF_AUDIT_SECTION_IDS: readonly SectionId[] =
  PDF_AUDIT_SECTIONS.map((s) => s.id);

/** The 8 sections parsed but NOT graded in the PDF composite, in display order. */
export const PDF_NON_GRADED_SECTION_IDS: readonly SectionId[] = SECTIONS
  .map((s) => s.id)
  .filter((id) => !PDF_AUDIT_SECTION_IDS.includes(id));
