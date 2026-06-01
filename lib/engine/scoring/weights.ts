import type { SectionId } from '@/lib/engine/types';

interface SectionMeta {
  id: SectionId;
  label: string;
  weight: number; // 0-1; sums to 1.0 across ALL sections (the rubric's nominal weights)
  aboveTheFold: boolean;
  // Display order matches RUBRIC.md § 2 numbering (01..12)
  order: number;
  /**
   * Whether the LinkedIn "Save to PDF" export can convey enough signal
   * to score this section. PDF-invisible sections (photo composition,
   * banner image, featured items, activity cadence, recommendations
   * count) are graded from the optional self-assessed checklist when
   * the user fills it in — and excluded from the composite when they
   * don't. See `pdfCompositeConfig.ts` for the renormalisation rules.
   */
  pdfVisible: boolean;
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
  { id: 'headline', label: 'Headline', weight: 0.16, aboveTheFold: true, order: 1, pdfVisible: true },
  { id: 'photo', label: 'Photo', weight: 0.08, aboveTheFold: true, order: 2, pdfVisible: false },
  { id: 'banner', label: 'Banner', weight: 0.05, aboveTheFold: true, order: 3, pdfVisible: false },
  { id: 'about', label: 'About', weight: 0.18, aboveTheFold: true, order: 4, pdfVisible: true },
  { id: 'currentExperience', label: 'Current Experience', weight: 0.14, aboveTheFold: true, order: 5, pdfVisible: true },
  { id: 'experienceHistory', label: 'Experience (full history)', weight: 0.10, aboveTheFold: false, order: 6, pdfVisible: true },
  { id: 'skills', label: 'Skills', weight: 0.08, aboveTheFold: false, order: 7, pdfVisible: true },
  { id: 'featured', label: 'Featured', weight: 0.05, aboveTheFold: true, order: 8, pdfVisible: false },
  { id: 'activity', label: 'Activity', weight: 0.06, aboveTheFold: false, order: 9, pdfVisible: false },
  { id: 'recommendations', label: 'Recommendations', weight: 0.04, aboveTheFold: false, order: 10, pdfVisible: false },
  { id: 'education', label: 'Education & Certifications', weight: 0.03, aboveTheFold: false, order: 11, pdfVisible: true },
  { id: 'keywordHealth', label: 'Keyword & Buzzword Health', weight: 0.03, aboveTheFold: false, order: 12, pdfVisible: true },
];

export function sectionMeta(id: SectionId): SectionMeta {
  const m = SECTIONS.find((s) => s.id === id);
  if (!m) throw new Error(`Unknown section id: ${id}`);
  return m;
}

export function totalWeight(): number {
  return SECTIONS.reduce((sum, s) => sum + s.weight, 0);
}

/**
 * Section IDs that the LinkedIn PDF export CAN convey signal for — the
 * composite-with-no-self-report is a weighted average over exactly these,
 * renormalised so their weights sum to 1.0.
 */
export const PDF_VISIBLE_SECTION_IDS: readonly SectionId[] = SECTIONS
  .filter((s) => s.pdfVisible)
  .map((s) => s.id);

/**
 * Section IDs that the LinkedIn PDF export CANNOT score. Included in the
 * composite only when the user fills in the self-assessed checklist, and
 * even then capped at `PDF_INVISIBLE_WEIGHT_CAP` of the composite.
 */
export const PDF_INVISIBLE_SECTION_IDS: readonly SectionId[] = SECTIONS
  .filter((s) => !s.pdfVisible)
  .map((s) => s.id);
