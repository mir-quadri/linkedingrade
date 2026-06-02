import type { AuditResult, SectionId, SectionScore } from '@/lib/engine/types';

/**
 * The above-the-fold sections the email gate reveals. These are the
 * strongest-signal sections — they're what most users would jump straight
 * to anyway, so showing them un-blurred (with the rest gated) creates
 * honest expectations: the gate buys you the full report, not the only
 * useful signal.
 */
export const PREVIEW_SECTION_IDS: SectionId[] = [
  'headline',
  'about',
  'currentExperience',
];

export interface AuditPreview {
  url: string;
  fullName: string | null;
  /** Mirrors `profile.nameConfidence` — 'low' when the name looks misparsed. */
  nameConfidence?: 'high' | 'low';
  composite: AuditResult['composite'];
  /** Always exactly the sections in `PREVIEW_SECTION_IDS`. */
  previewSections: SectionScore[];
  /** How many sections the gated full report adds on top of the preview. */
  gatedSectionCount: number;
  generatedAt: string;
}

export function buildPreview(
  audit: AuditResult,
  fullName: string | null,
  nameConfidence?: 'high' | 'low',
): AuditPreview {
  const previewSections = PREVIEW_SECTION_IDS
    .map((id) => audit.sections.find((s) => s.id === id))
    .filter((s): s is SectionScore => Boolean(s));
  return {
    url: audit.url,
    fullName,
    nameConfidence,
    composite: audit.composite,
    previewSections,
    gatedSectionCount: Math.max(0, audit.sections.length - previewSections.length),
    generatedAt: audit.generatedAt,
  };
}
