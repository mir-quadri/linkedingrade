import type { SectionScore, FixSuggestion, WinHighlight } from '@/lib/engine/types';
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

/**
 * Pick the top 3 wins — sections scoring highest, stated as strengths to keep.
 * Only A− or better qualifies as a "win"; if fewer than 3 qualify, return what we have.
 */
export function pickWins(sections: SectionScore[]): WinHighlight[] {
  return [...sections]
    .filter((s) => s.adjustedScore >= 90)
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
): FixSuggestion[] {
  const candidates = sections
    .filter((s) => s.adjustedScore < 90) // skip A- and above
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
