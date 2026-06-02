import type { ProfileData, AuditResult, SectionScore, SectionId } from '@/lib/engine/types';
import type { Judge, JudgeRequest, JudgeResponse } from '@/lib/engine/types/judge';
import type { SelfReport } from '@/lib/storage/auditStore';
import { NullJudge } from '@/lib/engine/types/judge';
import { SECTIONS, sectionMeta } from './weights';
import {
  PDF_INVISIBLE_NO_SELF_REPORT_MESSAGE,
  PDF_INVISIBLE_WEIGHT_CAP,
  scoreSelfReportSection,
} from './pdfCompositeConfig';
import { scoreToLetter } from './letters';
import { applySeniorityModifier, inferSeniority, TIER_LABEL } from './seniority';
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
export { SECTIONS } from './weights';

export interface RunScoringOptions {
  judge?: Judge;
}

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
 * Pure scoring. Takes a ProfileData, a JudgeResponse (which may be
 * empty if the AI layer is unavailable), and an optional self-assessed
 * checklist. Returns a complete AuditResult.
 *
 * The `selfReport` argument changes the composite-calc behaviour:
 *   - `null` / undefined → PDF-invisible sections are excluded from
 *     the composite and re-labelled "Not visible to this audit". This
 *     is the right default for a freshly-uploaded PDF.
 *   - present → PDF-invisible sections with an answer are scored from
 *     the answer (see `scoreSelfReportSection`) and included at the
 *     capped reduced weight. A poor self-report never lowers the
 *     composite below the visible-only baseline.
 */
export function runScoring(
  profile: ProfileData,
  judgeResponse: JudgeResponse = {},
  selfReport: SelfReport | null = null,
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

  // Track which PDF-invisible sections the user actually answered.
  // Only those enter the composite — see `computeComposite` and the
  // Codex P2 fix on this PR. An unanswered self-report field falls
  // through to the "Not visible to this audit" label below and is
  // excluded from the invisible average so a parser-fallback 60/65
  // doesn't get presented as verified signal.
  const invisibleSelfReportedIds = new Set<SectionId>();
  const sections: SectionScore[] = SECTIONS.map((meta) => {
    let raw = rawByID[meta.id]!;
    // PDF-invisible section post-processing. The section scorers ran
    // against an empty ProfileData branch (the parser can't see these
    // sections) and returned their fallback "could not extract" output.
    // Replace that output with either:
    //   - the self-report-derived score, when an answer exists, OR
    //   - a clear "Not visible to this audit" label, when no answer.
    // The composite already excludes unanswered invisible sections; the
    // label change is so the section grade card on the report doesn't
    // present a parser-fallback C/D as a verdict.
    if (!meta.pdfVisible) {
      const fromSelfReport = selfReport
        ? scoreSelfReportSection(meta.id, selfReport)
        : null;
      if (fromSelfReport) {
        raw = {
          rawScore: fromSelfReport.rawScore,
          reasons: [fromSelfReport.oneLineWhy],
          oneLineWhy: fromSelfReport.oneLineWhy,
          needsReview: false,
        };
        invisibleSelfReportedIds.add(meta.id);
      } else {
        // No self-report at all OR self-report present but this
        // specific section unanswered. Either way, the section is
        // excluded from the composite below and surfaces the
        // "Not visible to this audit" label instead of a verdict.
        raw = {
          rawScore: raw.rawScore,
          reasons: [PDF_INVISIBLE_NO_SELF_REPORT_MESSAGE],
          oneLineWhy: PDF_INVISIBLE_NO_SELF_REPORT_MESSAGE,
          needsReview: true,
        };
      }
    }
    const adjusted = applySeniorityModifier(raw.rawScore, seniority.modifier);
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

  const composite = computeComposite(sections, seniority.tier, seniority.assumed, {
    invisibleSelfReportedIds,
  });
  // PDF-invisible sections without a self-report answer aren't in the
  // composite — surfacing them as "fixes" or "wins" would mislead users
  // about composite-point gains. Codex P2 on PR #15 (round 2): exclude
  // them.
  const excludeFromActionable = new Set<SectionId>();
  for (const meta of SECTIONS) {
    if (!meta.pdfVisible && !invisibleSelfReportedIds.has(meta.id)) {
      excludeFromActionable.add(meta.id);
    }
  }
  // Effective composite weights for the fix-leverage estimate.
  // computeComposite renormalises the visible-section weights to
  // sum to 1.0 of `visibleFraction` (= 1 - 15% when at least one
  // invisible section is answered, else 1.0); answered invisible
  // sections split 15% among themselves. pickFixes used to read
  // `s.weight` (the nominal RUBRIC weight) directly, which under-
  // reported visible-section gains and mis-ranked invisibles —
  // Codex P2 on PR #15 (round 3). Build the same effective-weight
  // map computeComposite uses so the action plan reflects the score
  // it claims to improve.
  const effectiveWeights = new Map<SectionId, number>();
  const visibleSectionsForWeights = sections.filter((s) => sectionMeta(s.id).pdfVisible);
  const visibleNominalSum = visibleSectionsForWeights.reduce((sum, s) => sum + s.weight, 0);
  const answeredInvisibleSectionsForWeights = sections.filter(
    (s) => !sectionMeta(s.id).pdfVisible && invisibleSelfReportedIds.has(s.id),
  );
  const answeredInvisibleNominalSum = answeredInvisibleSectionsForWeights.reduce(
    (sum, s) => sum + s.weight,
    0,
  );
  const visibleFraction = invisibleSelfReportedIds.size > 0
    ? 1 - PDF_INVISIBLE_WEIGHT_CAP
    : 1.0;
  if (visibleNominalSum > 0) {
    for (const s of visibleSectionsForWeights) {
      effectiveWeights.set(s.id, (s.weight / visibleNominalSum) * visibleFraction);
    }
  }
  if (answeredInvisibleNominalSum > 0) {
    for (const s of answeredInvisibleSectionsForWeights) {
      effectiveWeights.set(
        s.id,
        (s.weight / answeredInvisibleNominalSum) * PDF_INVISIBLE_WEIGHT_CAP,
      );
    }
  }
  const pickOptions = {
    excludeSectionIds: excludeFromActionable,
    effectiveWeights,
  };
  const wins = pickWins(sections, pickOptions);
  const fixes = pickFixes(sections, judgeResponse.rewrites, pickOptions);

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
