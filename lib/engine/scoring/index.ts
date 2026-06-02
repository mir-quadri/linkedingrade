import type { ProfileData, AuditResult, SectionScore, SectionId } from '@/lib/engine/types';
import type { Judge, JudgeRequest, JudgeResponse } from '@/lib/engine/types/judge';
import { NullJudge } from '@/lib/engine/types/judge';
import {
  SECTIONS,
  sectionMeta,
  PDF_AUDIT_SECTIONS,
  PDF_AUDIT_SECTION_IDS,
} from './weights';
import { scoreToLetter, B_PLUS_CEILING } from './letters';
import {
  applySeniorityModifier,
  bandedTierModifier,
  inferSeniority,
  TIER_LABEL,
} from './seniority';
import { computeComposite } from './composite';
import { pickFixes, pickWins } from './fixes';
import { scoreHeadline } from './sections/headline';
import { scorePhoto } from './sections/photo';
import { scoreBanner } from './sections/banner';
import { scoreAbout } from './sections/about';
import { scoreCurrentExperience } from './sections/currentExperience';
import { scoreExperienceHistory } from './sections/experienceHistory';
import { scoreSkills } from './sections/skills';
import { scoreFeatured } from './sections/featured';
import { scoreActivity } from './sections/activity';
import { scoreRecommendations } from './sections/recommendations';
import { scoreEducation } from './sections/education';
import { scoreKeywordHealth } from './sections/keywordHealth';

export { inferSeniority } from './seniority';
export { scoreToLetter, LETTER_BOUNDARIES } from './letters';
export {
  SECTIONS,
  PDF_AUDIT_SECTIONS,
  PDF_AUDIT_SECTION_IDS,
  PDF_NON_GRADED_SECTION_IDS,
} from './weights';

export interface RunScoringOptions {
  judge?: Judge;
}

/**
 * Scoring mode.
 *
 *  - `'full'` (default): the 12-section audit (the Chrome extension's surface).
 *    The composite is the weighted average of all 12 sections.
 *  - `'pdf'`: the focused 4-section "Sample Audit" the PDF flow ships. The
 *    `sections` array still carries all 12 entries (the 8 non-graded sections
 *    are parsed and returned for reference), but the composite, top wins and
 *    highest-leverage fixes are computed from the 4 graded sections only —
 *    Headline, About, Current Experience and Career Arc (`experienceHistory`),
 *    each at 25% weight.
 */
export type ScoringMode = 'full' | 'pdf';

/**
 * Build the JudgeRequest the AI layer needs from the extracted profile.
 * Exported so the background script can fire it as a single batched call.
 */
export function buildJudgeRequest(profile: ProfileData): JudgeRequest {
  const headline = profile.headline.data?.trim();
  const about = profile.about.data?.trim();
  const cur = profile.currentExperience.data;
  // extractExperience stores the current role as history[0]; skip it here so
  // the current-role description doesn't appear in fullText twice and over-
  // weight a single section in the AI's buzzword/keyword judgment.
  //
  // SYNC-DIVERGENCE: the unconditional `slice(1)` is wrong when there is
  // no current role (PDF-sourced between-jobs profiles). In that case
  // history[0] is the most recent past role and dropping it strips the
  // user's freshest description from `fullText`, starving the AI's
  // buzzword/keyword judgments. See `lib/engine/README.md`. Back-port and
  // restore the unconditional form once the extension lands the same fix.
  const pastRoles = cur
    ? (profile.experienceHistory.data ?? []).slice(1)
    : (profile.experienceHistory.data ?? []);
  const fullText = [
    profile.headline.data ?? '',
    profile.about.data ?? '',
    cur?.description ?? '',
    ...pastRoles.map((e) => e.description ?? ''),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    headline: headline ? { text: headline } : undefined,
    about: about ? { text: about } : undefined,
    currentExperience:
      cur && (cur.title || cur.description)
        ? {
            title: cur.title,
            company: cur.company,
            description: cur.description ?? '',
          }
        : undefined,
    fullText: fullText ? { text: fullText } : undefined,
    rolesFamilyHint: inferRoleFamilyHint(profile),
    // Skip the photo request for default avatars — scorePhoto already
    // short-circuits to the default-avatar branch and never consumes an
    // AI photo judgment, so asking for one wastes proxy work AND makes
    // a missing photo judgment look like an outage in expectedJudgeKeys.
    photo:
      profile.photo.data && profile.photo.data.imageSrc && !profile.photo.data.isDefault
        ? { imageSrc: profile.photo.data.imageSrc }
        : undefined,
    banner:
      profile.banner.data && profile.banner.data.imageSrc && !profile.banner.data.isDefault
        ? { imageSrc: profile.banner.data.imageSrc }
        : undefined,
    featured: profile.featured.data
      ? {
          items: profile.featured.data.map((f) => ({ title: f.title, type: f.type })),
        }
      : undefined,
  };
}

/**
 * RUBRIC-ASSUMPTION: a coarse role-family hint is enough for the AI judge to
 * pick keyword expectations. v1 will replace this with the validated keyword
 * list from RUBRIC.md § 6.
 */
function inferRoleFamilyHint(profile: ProfileData): string | null {
  const blob = `${profile.headline.data ?? ''} ${profile.currentExperience.data?.title ?? ''}`.toLowerCase();
  // All matchers use word boundaries so unrelated substrings can't classify
  // the role family. Without \b, "data" would hit "candidate", "ui" would hit
  // "build" / "fluid", "ops" would hit "shops" / "develops", and so on —
  // and the false hint then biases the AI judge's keyword expectations.
  if (/\b(engineer|engineering|developer|software|swe)\b/.test(blob)) return 'engineering';
  if (/\bproduct manager\b|\bpm\b|\bproduct owner\b/.test(blob)) return 'product';
  if (/\b(design|designer|ux|ui)\b/.test(blob)) return 'design';
  if (/\bsales\b|\baccount executive\b|\bae\b/.test(blob)) return 'sales';
  if (/\b(marketing|marketer|growth|brand)\b/.test(blob)) return 'marketing';
  if (/\b(data|analyst|scientist)\b/.test(blob)) return 'data';
  if (/\b(ops|operations)\b/.test(blob)) return 'operations';
  return null;
}

/**
 * The set of AI judgments we would have requested for this profile.
 * Used to compute judgeStatus — if the profile didn't have a banner image,
 * a missing banner judgment isn't a sign of AI degradation.
 *
 * `rewrites` is metadata, not a scoring judgment, so it's not included.
 */
function expectedJudgeKeys(profile: ProfileData): (keyof JudgeResponse)[] {
  const expected: (keyof JudgeResponse)[] = [];
  if (profile.headline.data?.trim()) expected.push('headline');
  if (profile.about.data?.trim()) expected.push('about');
  // Mirror buildJudgeRequest: currentExperience is requested whenever title
  // OR description is set, not only when description is non-empty.
  // Otherwise judgeStatus could report 'ok' on title-only profiles even when
  // the AI dropped the currentExperience judgment.
  if (profile.currentExperience.data?.title?.trim() || profile.currentExperience.data?.description?.trim()) {
    expected.push('currentExperience');
  }
  if (profile.photo.data?.imageSrc && !profile.photo.data.isDefault) expected.push('photo');
  if (
    profile.banner.data?.imageSrc &&
    !profile.banner.data.isDefault
  ) {
    expected.push('banner');
  }
  if ((profile.featured.data?.length ?? 0) > 0) expected.push('featured');
  // Cross-cutting text judgments only requested when there's text to judge.
  // Must mirror buildJudgeRequest.fullText, which also pulls past-role
  // descriptions — otherwise profiles with text only in history would
  // wrongly report 'ok' when buzzwords/keywords judgments are missing.
  // SYNC-DIVERGENCE: mirrors the conditional slice in buildJudgeRequest
  // so expectedJudgeKeys stays consistent with what fullText actually
  // contained. See `lib/engine/README.md`.
  const pastRoles = profile.currentExperience.data
    ? (profile.experienceHistory.data ?? []).slice(1)
    : (profile.experienceHistory.data ?? []);
  const hasText =
    !!profile.headline.data?.trim() ||
    !!profile.about.data?.trim() ||
    !!profile.currentExperience.data?.description?.trim() ||
    pastRoles.some((e) => !!e.description?.trim());
  if (hasText) {
    expected.push('buzzwords');
    expected.push('keywords');
  }
  return expected;
}

/**
 * Pure scoring. Takes a ProfileData and a JudgeResponse (which may be empty
 * if the AI layer is unavailable). Returns a complete AuditResult.
 */
export function runScoring(
  profile: ProfileData,
  judgeResponse: JudgeResponse = {},
  mode: ScoringMode = 'full',
): AuditResult {
  const seniority = inferSeniority(profile);
  const warnings: string[] = [];
  if (seniority.assumed) {
    warnings.push(`Seniority assumed: ${seniority.rationale}`);
  }

  type RawResult = { rawScore: number; reasons: string[]; oneLineWhy: string; needsReview: boolean };
  const rawByID: Partial<Record<SectionId, RawResult>> = {
    headline: scoreHeadline(profile, judgeResponse.headline),
    photo: scorePhoto(profile, judgeResponse.photo),
    banner: scoreBanner(profile, judgeResponse.banner),
    about: scoreAbout(profile, judgeResponse.about),
    currentExperience: scoreCurrentExperience(profile, judgeResponse.currentExperience),
    experienceHistory: scoreExperienceHistory(profile),
    skills: scoreSkills(profile),
    featured: scoreFeatured(profile, judgeResponse.featured),
    activity: scoreActivity(profile),
    recommendations: scoreRecommendations(profile),
    education: scoreEducation(profile),
    keywordHealth: scoreKeywordHealth(profile, judgeResponse.buzzwords, judgeResponse.keywords),
  };

  const sections: SectionScore[] = SECTIONS.map((meta) => {
    const raw = rawByID[meta.id]!;
    // Asymmetric, banded tier modifier: depends on the tier AND this section's
    // raw score so excellence is never penalised for being senior (and strong
    // early-career work is actively rewarded). Replaces the old flat modifier.
    const modifier = bandedTierModifier(seniority.tier, raw.rawScore);
    let adjusted = applySeniorityModifier(raw.rawScore, modifier);
    // B+ ceiling: a structural-only (AI-pending) section can't exceed the B+
    // band — structural cues can't distinguish A-grade originality from clever
    // cliché-stuffing. The AI judge lifts B+ → A later; it never drops a
    // structural grade. See `lib/engine/README.md`.
    if (raw.needsReview) adjusted = Math.min(adjusted, B_PLUS_CEILING);
    return {
      id: meta.id,
      label: meta.label,
      weight: meta.weight,
      rawScore: raw.rawScore,
      adjustedScore: adjusted,
      letter: scoreToLetter(adjusted),
      reasons: raw.reasons,
      oneLineWhy: raw.oneLineWhy,
      aboveTheFold: meta.aboveTheFold,
      needsReview: raw.needsReview,
    };
  });

  // PDF audit: the composite, wins and fixes are scoped to the 4 graded
  // sections only (each 25%). The full audit weights all 12 sections.
  const gradedWeights =
    mode === 'pdf'
      ? new Map<SectionId, number>(PDF_AUDIT_SECTIONS.map((s) => [s.id, s.weight]))
      : undefined;
  const scoredFor =
    mode === 'pdf'
      ? sections.filter((s) => PDF_AUDIT_SECTION_IDS.includes(s.id))
      : sections;

  const composite = computeComposite(sections, seniority.tier, seniority.assumed, gradedWeights);
  const wins = pickWins(scoredFor);
  const fixes = pickFixes(scoredFor, judgeResponse.rewrites);

  // Heat map: above-the-fold first, then below-the-fold, each in display order.
  const heatMap = [...sections]
    .sort((a, b) => {
      if (a.aboveTheFold !== b.aboveTheFold) return a.aboveTheFold ? -1 : 1;
      return sectionMeta(a.id).order - sectionMeta(b.id).order;
    })
    .map((s) => ({
      sectionId: s.id,
      letter: s.letter,
      aboveTheFold: s.aboveTheFold,
    }));

  // judgeStatus is about AI-judge coverage ONLY. It must not be derived
  // from section.needsReview, because that flag is also set when an
  // extraction misses (DOM drift / selector drift). Compare what we'd
  // have asked the judge for (based on profile content) against what
  // came back; report 'partial'/'unavailable' only when the AI itself
  // didn't cover what it was asked.
  const expectedAI = expectedJudgeKeys(profile);
  const presentAI = expectedAI.filter((k) => judgeResponse[k] != null);
  const missingAI = expectedAI.length - presentAI.length;
  let judgeStatus: AuditResult['judgeStatus'] = 'ok';
  if (expectedAI.length > 0 && presentAI.length === 0) judgeStatus = 'unavailable';
  else if (missingAI > 0) judgeStatus = 'partial';

  if (judgeStatus !== 'ok') {
    warnings.push(
      `AI judgment ${judgeStatus === 'unavailable' ? 'unavailable' : 'partially unavailable'} — ${missingAI} of ${expectedAI.length} expected AI judgment(s) missing.`,
    );
  }

  return {
    url: profile.url,
    generatedAt: new Date().toISOString(),
    composite,
    sections,
    wins,
    fixes,
    heatMap,
    judgeStatus,
    warnings,
  };
}

/**
 * Heuristic: does a parsed `fullName` look like a misparse rather than a real
 * name? LinkedIn's PDF export occasionally bleeds the headline (or a
 * Publications/contact column) into the name slot, producing strings with
 * pipes, far too many words, or headline-like phrasing. This is a belt-and-
 * suspenders guard alongside the parser fix.
 */
export function isSuspiciousName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  // Pipes never appear in real names but are the canonical headline separator.
  if (trimmed.includes('|')) return true;
  // Real names are short. More than 5 whitespace-delimited words reads as a
  // headline or a run-together column, not a person's name.
  if (trimmed.split(/\s+/).length > 5) return true;
  // Common headline punctuation / connectors that don't belong in a name.
  if (/[•·@/&]/.test(trimmed)) return true;
  if (/\bat\b/i.test(trimmed)) return true;
  return false;
}

/**
 * Normalise a profile for the PDF audit. When `fullName` looks misparsed, the
 * name is replaced with a neutral placeholder ("Your audit") and
 * `nameConfidence` is set to `'low'` so the UI can render a name-free header.
 * Returns a new profile object; the input is not mutated.
 */
export function normalizeProfileForPdfAudit(profile: ProfileData): ProfileData {
  if (isSuspiciousName(profile.fullName)) {
    return { ...profile, fullName: 'Your audit', nameConfidence: 'low' };
  }
  return { ...profile, nameConfidence: profile.nameConfidence ?? 'high' };
}

/**
 * The 4 graded sections of the PDF audit, in display order, with their PDF
 * display labels applied (notably `experienceHistory` → "Career Arc"). The
 * section IDs are unchanged — only the user-facing label differs. Used by the
 * result page and the audit flow to render the 4 section cards.
 */
export function selectGradedPdfSections(sections: SectionScore[]): SectionScore[] {
  return PDF_AUDIT_SECTIONS.flatMap((meta) => {
    const s = sections.find((x) => x.id === meta.id);
    if (!s) return [];
    return [{ ...s, label: meta.displayLabel }];
  });
}

/**
 * Run the focused 4-section PDF "Sample Audit". Applies the name-suspicion
 * guard, then scores in `'pdf'` mode (composite/wins/fixes from the 4 graded
 * sections only). Returns the audit AND the normalised profile so the caller
 * can persist the (possibly name-corrected) profile and build the preview from
 * the same `fullName`.
 */
export function runPdfAudit(
  profile: ProfileData,
  judgeResponse: JudgeResponse = {},
): { profile: ProfileData; audit: AuditResult } {
  const normalized = normalizeProfileForPdfAudit(profile);
  const audit = runScoring(normalized, judgeResponse, 'pdf');
  return { profile: normalized, audit };
}

/**
 * Convenience for tests / fallback flows: score with the NullJudge.
 */
export async function runScoringWithJudge(
  profile: ProfileData,
  options: RunScoringOptions = {},
): Promise<AuditResult> {
  const judge = options.judge ?? new NullJudge();
  let response: JudgeResponse = {};
  try {
    response = await judge.evaluate(buildJudgeRequest(profile));
  } catch (err) {
    response = {};
  }
  return runScoring(profile, response);
}

export { TIER_LABEL };
