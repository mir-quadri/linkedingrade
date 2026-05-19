import type { ProfileData } from '@/lib/engine/types';
import type { BuzzwordJudgment, KeywordJudgment } from '@/lib/engine/types/judge';
import { scanBuzzwords } from '../buzzwords';

export interface KeywordHealthScore {
  rawScore: number;
  reasons: string[];
  oneLineWhy: string;
  needsReview: boolean;
}

/**
 * Keyword & Buzzword Health is cross-cutting: it looks at concatenated
 * text across the profile.
 *
 * RUBRIC-ASSUMPTION: keyword judgment depends on role-family lists
 * (RUBRIC.md § 6 backlog). Until those land, the keyword judgment from the
 * AI layer is the primary signal; the deterministic part scans buzzwords.
 */
export function scoreKeywordHealth(
  profile: ProfileData,
  buzz: BuzzwordJudgment | undefined,
  keywords: KeywordJudgment | undefined,
): KeywordHealthScore {
  const fullText = collectText(profile);
  const reasons: string[] = [];
  let score = 78;

  if (!fullText) {
    return {
      rawScore: 60,
      reasons: ['Not enough profile text to assess keyword & buzzword health.'],
      oneLineWhy: 'Insufficient text to assess.',
      needsReview: true,
    };
  }

  // Deterministic buzzword scan as a baseline signal.
  const localBuzz = scanBuzzwords(fullText);
  if (localBuzz.density === 'high') {
    score -= 14;
    reasons.push(`Heavy buzzword presence: ${localBuzz.hits.slice(0, 4).join(', ')}.`);
  } else if (localBuzz.density === 'medium') {
    score -= 6;
    reasons.push('Moderate buzzword presence — some recruiter-tasted phrasing.');
  } else {
    reasons.push('Buzzword load is low.');
  }

  let buzzUnknown = false;
  if (buzz) {
    // Defensive: the proxy parses model JSON without strict schema validation,
    // so any array-typed field might be missing or a non-array. Default to []
    // so a malformed-but-parseable response degrades gracefully instead of
    // crashing the audit.
    const examples = Array.isArray(buzz.examples) ? buzz.examples : [];
    if (buzz.density === 'high') {
      score -= 6;
      reasons.push(`AI judge confirms heavy buzzword density (${examples.slice(0, 3).join(', ')}).`);
    } else if (buzz.density === 'medium') {
      score -= 2;
      reasons.push('AI judge: moderate buzzword load.');
    } else if (buzz.density === 'low') {
      score += 4;
      reasons.push('AI judge confirms language reads as human-specific.');
    } else {
      // density absent or non-enum → no judgment to apply; flag as unknown.
      buzzUnknown = true;
      reasons.push('AI judge returned a buzzwords object without a density verdict — buzzword judgment pending.');
    }
  }

  let keywordsUnknown = false;
  if (keywords) {
    if (Array.isArray(keywords.missingKeywords)) {
      const missing = keywords.missingKeywords;
      if (missing.length === 0) {
        score += 6;
        reasons.push('Role-family keywords are present.');
      } else if (missing.length <= 3) {
        score -= 4;
        reasons.push(`Missing some keywords: ${missing.slice(0, 3).join(', ')}.`);
      } else {
        score -= 10;
        reasons.push(`Missing many role-family keywords (${missing.length}).`);
      }
    } else {
      // missingKeywords absent or non-array → no evidence of coverage either
      // way. Crediting +6 here turned partial AI output into a free score
      // bump; instead mark it as unknown so judgeStatus reflects the gap.
      keywordsUnknown = true;
      reasons.push('AI judge returned keyword density but no coverage list — keyword coverage assessment pending.');
    }
  } else {
    reasons.push('Keyword coverage assessment pending AI review.');
  }

  return {
    rawScore: clamp(score),
    reasons,
    oneLineWhy: oneLine(score),
    // Either sub-judgment missing — or keywords present but missingKeywords
    // absent, or buzzwords present but density absent — → AI coverage
    // degraded → flag for review.
    needsReview: !buzz || !keywords || keywordsUnknown || buzzUnknown,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function oneLine(score: number): string {
  if (score >= 90) return 'Keyword-complete and buzzword-clean.';
  if (score >= 75) return 'Missing some keywords or noticeably buzzword-flavoured.';
  return 'Algorithmically thin or reads as machine-generated.';
}

function collectText(p: ProfileData): string {
  const parts: string[] = [];
  if (p.headline.data) parts.push(p.headline.data);
  if (p.about.data) parts.push(p.about.data);
  const cur = p.currentExperience.data?.description;
  if (cur) parts.push(cur);
  // extractExperience stores the current role as history[0]; skip it so the
  // current-role description doesn't get counted twice in the buzzword scan.
  // SYNC-DIVERGENCE: when there's no current role the conditional keeps
  // history[0] (the most recent past role) in the scan, otherwise the
  // buzzword/keyword health is judged from stale or empty text on
  // between-jobs PDFs. See `lib/engine/README.md`.
  const history = p.experienceHistory.data ?? [];
  const past = p.currentExperience.data ? history.slice(1) : history;
  for (const e of past) {
    if (e.description) parts.push(e.description);
  }
  return parts.join('\n\n');
}
