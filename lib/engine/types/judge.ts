/**
 * The Judge interface is the qualitative-language layer the scoring engine
 * depends on. The scoring engine itself is pure: it knows weights, thresholds,
 * and structural signals. Anything that needs real language judgment
 * (cliché detection, buzzword density, voice quality) is delegated here.
 *
 * The real implementation lives in the background service worker and calls
 * the proxy. A NullJudge is used in tests and as a fallback when the proxy
 * is unreachable.
 */

export interface HeadlineJudgment {
  hasCliche: boolean;
  hasIdentity: boolean;
  hasDomain: boolean;
  hasCredibleSpecific: boolean;
  mobileSafe: boolean; // essential claim within first ~70 chars
  notes: string;
}

export interface AboutJudgment {
  hasHook: boolean;
  hasRange: boolean;
  hasCTA: boolean;
  voiceIsHuman: boolean; // not AI-default
  buzzwordDensity: 'low' | 'medium' | 'high';
  notes: string;
}

export interface ExperienceJudgment {
  outcomeLed: boolean;
  quantified: boolean;
  conveysScope: boolean;
  proportionate: boolean;
  buzzwordDensity: 'low' | 'medium' | 'high';
  notes: string;
}

export interface BuzzwordJudgment {
  density: 'low' | 'medium' | 'high';
  examples: string[];
  notes: string;
}

export interface KeywordJudgment {
  presentKeywords: string[];
  missingKeywords: string[];
  density: 'low' | 'medium' | 'high';
  notes: string;
}

export interface PhotoJudgment {
  framing: 'good' | 'poor' | 'unknown';
  professional: boolean;
  appearsCurrent: boolean;
  notes: string;
}

export interface BannerJudgment {
  isDefault: boolean;
  communicatesSomething: boolean;
  notes: string;
}

export interface FeaturedJudgment {
  strongProof: boolean;
  notes: string;
}

export interface Rewrite {
  before: string;
  after: string;
}

export interface JudgeRequest {
  headline?: { text: string };
  about?: { text: string };
  currentExperience?: { title: string | null; company: string | null; description: string };
  fullText?: { text: string }; // concatenated About + experience descriptions for buzzword scan
  rolesFamilyHint?: string | null; // e.g. "engineering", "product", inferred from titles
  photo?: { imageSrc: string | null };
  banner?: { imageSrc: string | null };
  featured?: { items: Array<{ title: string | null; type: string | null }> };
  // Rewrites are requested only for the lowest-scoring high-weight sections
  rewriteTargets?: Array<'headline' | 'about' | 'currentExperience'>;
}

export interface JudgeResponse {
  headline?: HeadlineJudgment;
  about?: AboutJudgment;
  currentExperience?: ExperienceJudgment;
  buzzwords?: BuzzwordJudgment;
  keywords?: KeywordJudgment;
  photo?: PhotoJudgment;
  banner?: BannerJudgment;
  featured?: FeaturedJudgment;
  rewrites?: Partial<Record<'headline' | 'about' | 'currentExperience', Rewrite>>;
}

export interface Judge {
  evaluate(req: JudgeRequest): Promise<JudgeResponse>;
}

/**
 * NullJudge — used in tests and as the fallback when the proxy is unreachable.
 * Returns no judgments; the scoring engine degrades each AI-dependent section
 * to "needs review" rather than failing the whole audit.
 */
export class NullJudge implements Judge {
  async evaluate(_req: JudgeRequest): Promise<JudgeResponse> {
    return {};
  }
}
