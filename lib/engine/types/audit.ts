export type Letter =
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D' | 'F';

export type SeniorityTier = 'T1' | 'T2' | 'T3';

export const SECTION_IDS = [
  'headline',
  'photo',
  'banner',
  'about',
  'currentExperience',
  'experienceHistory',
  'skills',
  'featured',
  'activity',
  'recommendations',
  'education',
  'keywordHealth',
] as const;

export type SectionId = typeof SECTION_IDS[number];

export interface SectionScore {
  id: SectionId;
  label: string;
  weight: number; // 0-1 fraction; sums to 1.0 across all sections
  rawScore: number; // 0-100, before seniority modifier
  adjustedScore: number; // 0-100, after seniority modifier
  letter: Letter;
  reasons: string[]; // signals/evidence
  oneLineWhy: string; // single line explainer for the report
  aboveTheFold: boolean;
  needsReview: boolean; // true if AI judgment was unavailable
  /**
   * True when this section has no displayable grade — the parser
   * cannot see it and no self-report answer is available. The card
   * still renders (with the "Not visible to this audit" oneLineWhy)
   * but the letter is suppressed so we don't present an apparent
   * verdict for a section we can't actually score.
   */
  ungraded?: boolean;
}

export interface CompositeResult {
  score: number; // 0-100 weighted composite
  letter: Letter;
  tier: SeniorityTier;
  tierAssumed: boolean; // true if the tier was a default fallback (T2)
  // Suppressed in v0 — see composite.ts. Will populate once real audit data
  // exists (RUBRIC.md § 6 validation backlog).
  percentileBand: string | null;
}

export interface FixSuggestion {
  sectionId: SectionId;
  label: string;
  currentLetter: Letter;
  targetLetter: Letter;
  pointsGain: number; // estimated composite-points gained
  effort: 'low' | 'medium' | 'high';
  recommendation: string;
  rewrite?: {
    before: string;
    after: string;
  };
}

export interface WinHighlight {
  sectionId: SectionId;
  label: string;
  letter: Letter;
  why: string;
}

export interface AuditResult {
  url: string;
  generatedAt: string;
  composite: CompositeResult;
  sections: SectionScore[];
  wins: WinHighlight[];
  fixes: FixSuggestion[];
  // Heat map: in eye-track order (above the fold first)
  heatMap: Array<{ sectionId: SectionId; letter: Letter; aboveTheFold: boolean }>;
  judgeStatus: 'ok' | 'partial' | 'unavailable';
  warnings: string[];
}
