import type { SectionScore, FixSuggestion, WinHighlight, SectionId } from '@/lib/engine/types';
import type { Rewrite } from '@/lib/engine/types/judge';
import { scoreToLetter, scoreToNextLetterThreshold } from './letters';

/**
 * Effort estimate per section. RUBRIC-ASSUMPTION: these are informed
 * defaults — Headline/About are quick to rewrite; Recommendations and
 * Activity require external action and time.
 */
const EFFORT_BY_SECTION: Record<string, 'low' | 'medium' | 'high'> = {
  headline: 'low',
  photo: 'medium',
  banner: 'low',
  about: 'low',
  currentExperience: 'low',
  experienceHistory: 'medium',
  skills: 'low',
  featured: 'medium',
  activity: 'high',
  recommendations: 'high',
  education: 'low',
  keywordHealth: 'medium',
};

const EFFORT_MULTIPLIER: Record<'low' | 'medium' | 'high', number> = {
  low: 1.0,
  medium: 0.65,
  high: 0.35,
};

export interface PickOptions {
  /**
   * Sections excluded from the composite — i.e. PDF-invisible sections
   * the user hasn't self-reported. The Codex P2 fix on this file: these
   * sections must NOT surface as fixes or wins, because their
   * `pointsGain` against the composite is zero (the composite excludes
   * them entirely). Without this filter, a freshly-uploaded PDF would
   * present "improve your Photo (+0.8 pts)" as a top fix even though
   * fixing the photo wouldn't move the composite without also filling
   * in the self-assessed block.
   */
  excludeSectionIds?: ReadonlySet<SectionId>;
}

/**
 * Pick the top 3 wins — sections scoring highest, stated as strengths to keep.
 * Only A− or better qualifies as a "win"; if fewer than 3 qualify, return what we have.
 */
export function pickWins(sections: SectionScore[], options: PickOptions = {}): WinHighlight[] {
  const { excludeSectionIds } = options;
  return [...sections]
    .filter((s) => s.adjustedScore >= 90)
    .filter((s) => !excludeSectionIds?.has(s.id))
    .sort((a, b) => b.adjustedScore - a.adjustedScore)
    .slice(0, 3)
    .map((s) => ({
      sectionId: s.id,
      label: s.label,
      letter: s.letter,
      why: s.oneLineWhy,
    }));
}

/**
 * Pick top-3 highest-leverage fixes.
 * Ranking score = section weight × points-to-next-letter × effort multiplier.
 * RUBRIC.md § 5.5: "ranked by points gained per effort".
 */
export function pickFixes(
  sections: SectionScore[],
  rewrites?: Partial<Record<string, Rewrite>>,
  options: PickOptions = {},
): FixSuggestion[] {
  const { excludeSectionIds } = options;
  const candidates = sections
    .filter((s) => s.adjustedScore < 90) // skip A- and above
    // Codex P2: drop sections that aren't in the composite. Their
    // `pointsGain` claim would be misleading because the composite
    // doesn't include them.
    .filter((s) => !excludeSectionIds?.has(s.id))
    .map((s) => {
      const nextThreshold = scoreToNextLetterThreshold(s.adjustedScore);
      const gap = Math.max(1, nextThreshold - s.adjustedScore);
      const effort = EFFORT_BY_SECTION[s.id] ?? 'medium';
      const effortMult = EFFORT_MULTIPLIER[effort];
      // Composite-points gained = weight × gap. Effort divides that.
      const pointsGain = s.weight * gap;
      const leverage = pointsGain * effortMult;
      const targetLetter = scoreToLetter(s.adjustedScore + gap);
      const rewrite = rewrites?.[s.id];
      return {
        sectionId: s.id,
        label: s.label,
        currentLetter: s.letter,
        targetLetter,
        pointsGain: Math.round(pointsGain * 100) / 100,
        effort,
        recommendation: s.oneLineWhy,
        rewrite,
        _leverage: leverage,
      };
    })
    .sort((a, b) => b._leverage - a._leverage);

  return candidates.slice(0, 3).map(({ _leverage, ...fix }) => fix as FixSuggestion);
}
