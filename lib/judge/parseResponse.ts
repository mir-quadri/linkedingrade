import type {
  JudgeResponse,
  HeadlineJudgment,
  AboutJudgment,
  BuzzwordJudgment,
  Rewrite,
} from '@/lib/engine/types/judge';

/**
 * Parse Claude's JSON output into a `JudgeResponse` the engine
 * understands. Strict but forgiving: if the model deviates from the
 * schema for one field, the others still come through. Any field that
 * we can't honestly extract is omitted (NOT defaulted) — the engine
 * keeps `needsReview: true` for sections it didn't get judgment for,
 * which is the right "fallback to structural" behaviour.
 *
 * Throws ONLY when the entire response is unparseable JSON. The route's
 * catch handler turns that into a "judge unavailable" reply.
 */
export function parseJudgeResponse(raw: string): JudgeResponse {
  // Tolerate ``` code fences even though the system prompt says no
  // markdown. Claude occasionally leaks a fence around the JSON; cheap
  // to strip and not worth a retry. Codex Round 9 P2: trim BEFORE
  // stripping so a leading newline/space (e.g. "\n```json\n…\n```")
  // doesn't dodge the anchored fence regex and leave the backticks
  // for JSON.parse to choke on.
  const cleaned = stripCodeFence(raw.trim()).trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('Judge response is not a JSON object.');
  }

  const result: JudgeResponse = {};
  const headline = extractHeadline(parsed.headline);
  if (headline) result.headline = headline;
  const about = extractAbout(parsed.about);
  if (about) result.about = about;
  const buzzwords = extractBuzzwords(parsed.buzzwords);
  if (buzzwords) result.buzzwords = buzzwords;
  const rewrites = extractRewrites(parsed.rewrites);
  if (rewrites) result.rewrites = rewrites;
  return result;
}

function stripCodeFence(s: string): string {
  const fenced = s.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i);
  return fenced?.[1] ?? s;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function density(v: unknown): 'low' | 'medium' | 'high' | undefined {
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return undefined;
}

function extractHeadline(v: unknown): HeadlineJudgment | undefined {
  if (!isRecord(v)) return undefined;
  // All five flags must be parseable for the judgment to count as a
  // headline judgment. A partial response would let the engine's
  // structural fallback do half-of-AI / half-of-fallback math, which
  // is worse than full fallback.
  const hasCliche = bool(v.hasCliche);
  const hasIdentity = bool(v.hasIdentity);
  const hasDomain = bool(v.hasDomain);
  const hasCredibleSpecific = bool(v.hasCredibleSpecific);
  const mobileSafe = bool(v.mobileSafe);
  if (
    hasCliche === undefined ||
    hasIdentity === undefined ||
    hasDomain === undefined ||
    hasCredibleSpecific === undefined ||
    mobileSafe === undefined
  ) {
    return undefined;
  }
  return {
    hasCliche,
    hasIdentity,
    hasDomain,
    hasCredibleSpecific,
    mobileSafe,
    notes: str(v.notes) ?? '',
  };
}

function extractAbout(v: unknown): AboutJudgment | undefined {
  if (!isRecord(v)) return undefined;
  const hasHook = bool(v.hasHook);
  const hasRange = bool(v.hasRange);
  const hasCTA = bool(v.hasCTA);
  const voiceIsHuman = bool(v.voiceIsHuman);
  const buzzwordDensity = density(v.buzzwordDensity);
  if (
    hasHook === undefined ||
    hasRange === undefined ||
    hasCTA === undefined ||
    voiceIsHuman === undefined ||
    buzzwordDensity === undefined
  ) {
    return undefined;
  }
  return {
    hasHook,
    hasRange,
    hasCTA,
    voiceIsHuman,
    buzzwordDensity,
    notes: str(v.notes) ?? '',
  };
}

function extractBuzzwords(v: unknown): BuzzwordJudgment | undefined {
  if (!isRecord(v)) return undefined;
  const d = density(v.density);
  if (d === undefined) return undefined;
  const examplesRaw = Array.isArray(v.examples) ? v.examples : [];
  const examples = examplesRaw
    .filter((x): x is string => typeof x === 'string')
    .slice(0, 5);
  return { density: d, examples, notes: str(v.notes) ?? '' };
}

function extractRewrites(
  v: unknown,
): Partial<Record<'headline' | 'about' | 'currentExperience', Rewrite>> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Partial<Record<'headline' | 'about' | 'currentExperience', Rewrite>> = {};
  for (const key of ['headline', 'about', 'currentExperience'] as const) {
    const entry = v[key];
    if (!isRecord(entry)) continue;
    const before = str(entry.before);
    const after = str(entry.after);
    if (before === undefined || after === undefined) continue;
    out[key] = { before, after };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
