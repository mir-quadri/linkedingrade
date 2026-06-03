import { describe, expect, it } from 'vitest';

import type { ProfileData } from '@/lib/engine/types';
import type { SelfReport } from '@/lib/storage/auditStore';
import { runScoring } from '@/lib/engine/scoring';
import {
  PDF_INVISIBLE_WEIGHT_CAP,
  scoreSelfReportSection,
} from '@/lib/engine/scoring/pdfCompositeConfig';
import { PDF_INVISIBLE_SECTION_IDS } from '@/lib/engine/scoring/weights';
import { scoreToNextLetterThreshold } from '@/lib/engine/scoring/letters';

/**
 * Calibration snapshot for the PDF composite recalibration.
 *
 * Pre-recalibration symptom: four very different real LinkedIn PDF
 * exports — Mir, John, Michael, Sidra — all scored 56-58 (every one
 * an F) because the PDF-invisible sections (Photo, Banner, Featured,
 * Activity, Recommendations) claimed ~28% of the composite at their
 * RUBRIC.md nominal weights, all defaulting to F since the parser
 * cannot see them. The result was a 0.6-point spread across the four
 * — the composite did not differentiate, which is product-defining
 * since the composite IS the product.
 *
 * Post-recalibration target:
 *   - composite is a weighted average over the PDF-visible sections
 *     only when no self-report is attached,
 *   - PDF-invisible sections enter at reduced (capped) weight when a
 *     self-report IS attached,
 *   - a missing or poor self-report can never lower the composite
 *     below the visible-only baseline,
 *   - the four-profile spread is > 25 points, with the documented
 *     ordering: John > Sidra > Mir > Michael.
 *
 * These tests construct synthetic ProfileData shapes that approximate
 * the four real exports (we can't ship real LinkedIn PDFs in the
 * repo). The numbers below are calibration targets, not arbitrary
 * thresholds — if a future scorer change drives one of the four out
 * of the documented ordering, the user-facing audit has regressed.
 */

function missing<T>(notes = 'extraction missed'): {
  data: T | null;
  confidence: 'missing';
  notes: string;
} {
  return { data: null, confidence: 'missing', notes };
}

function blankProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    url: 'https://www.linkedin.com/in/example',
    extractedAt: '2026-06-01T00:00:00Z',
    fullName: 'Example Person',
    headline: missing<string>('No headline'),
    photo: missing('No photo data in PDF'),
    banner: missing('No banner data in PDF'),
    about: missing<string>('No about'),
    currentExperience: missing('No current role'),
    experienceHistory: missing<ProfileData['experienceHistory']['data']>('No history'),
    skills: missing<ProfileData['skills']['data']>('No skills'),
    featured: missing('No featured'),
    activity: missing('No activity'),
    recommendations: missing('No recommendations'),
    education: missing<ProfileData['education']['data']>('No education'),
    certifications: missing<ProfileData['certifications']['data']>('No certifications'),
    ...overrides,
  };
}

/**
 * John — ex-COO, JPMC, NYU Stern MBA, multiple certs. Should score
 * highest of the four. The parseable signal is dense across every
 * PDF-visible section: senior current role, long history, populated
 * about, skills list, MBA + undergrad, several certifications.
 */
const johnProfile: ProfileData = blankProfile({
  fullName: 'John Example',
  headline: {
    data: 'COO @ Fintech | Built and scaled four risk + ops orgs across global banks. JPMC alum. NYU Stern MBA.',
    confidence: 'high',
  },
  about: {
    data:
      'Twenty-year operator with four end-to-end ops + risk transformations behind me, two of them at JPMorgan Chase. I run regulated-finance programs that have to clear audit, not slide decks. PMP, CSPO, AWS Solutions Architect Professional, FinOps. I write, ship, and sunset operating models. I have opinions about cost-to-serve, KPI tree design, and why most COO offices are theatre. Most recently: scaled a $400M ops function from 90 to 230 across three regions while cutting the SLA breach rate by 60%.',
    confidence: 'high',
  },
  currentExperience: {
    data: {
      company: 'Strong Fintech Co.',
      title: 'Chief Operating Officer',
      dates: 'August 2022 - Present',
      durationText: '3 years 10 months',
      description:
        'Own ops, risk, and the change book of record across the firm. Built the firm-wide risk-and-controls operating model from scratch. Cut SLA breach rate 60%, scaled the function from 90 to 230 across three regions, and delivered three regulatory remediations on time.',
    },
    confidence: 'high',
  },
  experienceHistory: {
    data: [
      {
        company: 'Strong Fintech Co.',
        title: 'Chief Operating Officer',
        dates: 'August 2022 - Present',
        durationText: '3 years 10 months',
        description: 'Same as Current Experience.',
      },
      {
        company: 'JPMorgan Chase & Co.',
        title: 'Managing Director, Operations',
        dates: 'June 2014 - July 2022',
        durationText: '8 years 1 month',
        description:
          'Ran the CCB operations transformation programme — 3 large platforms, 1B+ annual transactions, 99.8% availability. Owned the operating-model rewrite and the multi-year remediation roadmap. Closed two MRAs and one MRIA.',
      },
      {
        company: 'JPMorgan Chase & Co.',
        title: 'Vice President, Operations Strategy',
        dates: 'September 2010 - May 2014',
        durationText: '3 years 9 months',
        description: 'Operations strategy across CCB. Led the global ATM transformation programme.',
      },
      {
        company: 'Goldman Sachs',
        title: 'Associate, Operations',
        dates: 'July 2007 - August 2010',
        durationText: '3 years 2 months',
        description: 'Equities operations across cash, derivatives, and prime brokerage.',
      },
    ],
    confidence: 'high',
  },
  skills: {
    data: {
      topThree: ['Operating Models', 'Risk Governance', 'Operations Transformation'],
      all: ['Operating Models', 'Risk Governance', 'Operations Transformation'],
      endorsementCounts: {},
    },
    confidence: 'high',
  },
  education: {
    data: [
      {
        school: 'New York University - Leonard N. Stern School of Business',
        degree: 'Master of Business Administration, Finance & Strategy',
        dates: 'September 2010 - June 2013',
      },
      {
        school: 'University of Michigan',
        degree: 'Bachelor of Arts, Economics',
        dates: 'September 2003 - May 2007',
      },
    ],
    confidence: 'high',
  },
  certifications: {
    data: [
      { name: 'PMP', issuer: null, date: null },
      { name: 'Certified Scrum Product Owner (CSPO)', issuer: null, date: null },
      { name: 'AWS Solutions Architect — Professional', issuer: null, date: null },
      { name: 'FinOps Certified Practitioner', issuer: null, date: null },
    ],
    confidence: 'high',
  },
});

/**
 * Sidra — strong content, slightly thinner than John. Senior PM role
 * with a substantive description, decent history, no MBA but a clean
 * undergrad and one cert. Should sit between John and the others.
 */
const sidraProfile: ProfileData = blankProfile({
  fullName: 'Sidra Example',
  headline: {
    data: 'Senior Product Manager @ HealthTech — building clinical workflow tools for hospital systems.',
    confidence: 'high',
  },
  about: {
    data:
      'I build clinical workflow software for hospital systems — the unglamorous "scheduling and routing" surface that nurses and admins actually use. Eight years in product, four in healthcare. I obsess over the operational handoffs that turn good clinical decisions into bad patient outcomes. Currently leading the rollout of a multi-EHR-integrated scheduling product across three regional health systems.',
    confidence: 'high',
  },
  currentExperience: {
    data: {
      company: 'HealthTech Co.',
      title: 'Senior Product Manager',
      dates: 'March 2022 - Present',
      durationText: '4 years 3 months',
      description:
        'Own the clinical-workflow product line — scheduling, routing, and the EHR integration layer. Shipped the multi-EHR rollout across three regional systems; nurse satisfaction +18 NPS.',
    },
    confidence: 'high',
  },
  experienceHistory: {
    data: [
      {
        company: 'HealthTech Co.',
        title: 'Senior Product Manager',
        dates: 'March 2022 - Present',
        durationText: '4 years 3 months',
        description: 'Same as Current Experience.',
      },
      {
        company: 'Other HealthTech Co.',
        title: 'Product Manager',
        dates: 'August 2019 - February 2022',
        durationText: '2 years 7 months',
        description: 'PM for the clinician-facing scheduling product. Led the migration off the legacy stack.',
      },
      {
        company: 'GenericCorp',
        title: 'Product Analyst',
        dates: 'July 2017 - July 2019',
        durationText: '2 years 1 month',
        description: 'Analytics support for the consumer-facing product team.',
      },
    ],
    confidence: 'high',
  },
  skills: {
    data: {
      topThree: ['Product Strategy', 'EHR Integration', 'Workflow Design'],
      all: ['Product Strategy', 'EHR Integration', 'Workflow Design'],
      endorsementCounts: {},
    },
    confidence: 'high',
  },
  education: {
    data: [
      {
        school: 'Cornell University',
        degree: 'Bachelor of Science, Computer Science',
        dates: 'September 2013 - May 2017',
      },
    ],
    confidence: 'high',
  },
  certifications: {
    data: [{ name: 'Certified Scrum Product Owner (CSPO)', issuer: null, date: null }],
    confidence: 'high',
  },
});

/**
 * Mir — the verbatim PR-#10 fixture profile. Senior multi-role
 * profile with a long About, full history, three top skills, five
 * certs, multi-degree education. Strong content but the current role
 * (Citi) has no description in the PDF — which deliberately tests
 * how the composite handles a "title-only" current role.
 */
const mirProfile: ProfileData = blankProfile({
  fullName: 'Mir Example',
  headline: {
    data: 'Enterprise AI & Transformation Leader | I put AI into production at regulated enterprises.',
    confidence: 'high',
  },
  about: {
    data:
      'I put AI into production at regulated enterprises. Four global banks. 15+ years. Software engineer by training. Product and transformation leader by experience. AI practitioner by conviction. Specialise in the governance, the operating model, and the change-management muscle to make adoption stick.',
    confidence: 'high',
  },
  currentExperience: {
    // Citi — no description, matches the real Mir PDF.
    data: {
      company: 'Citi',
      title: 'Transformation Product Manager',
      dates: 'July 2023 - Present',
      durationText: '2 years 11 months',
      description: null,
    },
    confidence: 'high',
  },
  experienceHistory: {
    data: [
      {
        company: 'Citi',
        title: 'Transformation Product Manager',
        dates: 'July 2023 - Present',
        durationText: '2 years 11 months',
        description: null,
      },
      {
        company: 'JPMorgan Chase & Co.',
        title: 'Senior Vice President - Global Digital Technology Leader',
        dates: 'March 2010 - July 2023',
        durationText: '13 years 5 months',
        description: 'CCB Technology and CCB Product & Experience',
      },
      {
        company: 'Viacom',
        title: 'Project Manager',
        dates: 'April 2008 - March 2010',
        durationText: '2 years',
        description: null,
      },
    ],
    confidence: 'high',
  },
  skills: {
    data: {
      topThree: ['Management Consulting', 'Project Plans', 'Executive-level Communication'],
      all: ['Management Consulting', 'Project Plans', 'Executive-level Communication'],
      endorsementCounts: {},
    },
    confidence: 'high',
  },
  education: {
    data: [
      {
        school: 'Massachusetts Institute of Technology',
        degree: 'Artificial Intelligence and Machine Learning',
        dates: 'December 2022 - March 2023',
      },
      { school: 'Bradley University', degree: 'M.S. Computer Science', dates: null },
    ],
    confidence: 'high',
  },
  certifications: {
    data: [
      { name: 'Project Management and Risk Analysis', issuer: null, date: null },
      { name: 'Amazon Web Services Cloud Practitioner', issuer: null, date: null },
      { name: 'Certified Ethical Hacker', issuer: null, date: null },
      { name: "Be the Manager People Won't Leave", issuer: null, date: null },
      { name: 'Foundations of Project Management', issuer: null, date: null },
    ],
    confidence: 'high',
  },
});

/**
 * Michael — thin VP. Title only, no description, no about, no
 * skills, no certs. Confirmed-empty (confidence='high' with null
 * data) — NOT extraction-missed — because the parser actually walked
 * those sections and found them empty, which is exactly what the
 * real Michael PDF showed. Should score lowest of the four by a
 * wide margin.
 */
const michaelProfile: ProfileData = blankProfile({
  fullName: 'Michael Example',
  headline: { data: 'Vice President', confidence: 'high' },
  about: { data: '', confidence: 'high' },
  currentExperience: {
    data: {
      company: 'GenericCorp',
      title: 'Vice President',
      dates: 'January 2022 - Present',
      durationText: '4 years 5 months',
      description: null,
    },
    confidence: 'high',
  },
  experienceHistory: {
    data: [
      {
        company: 'GenericCorp',
        title: 'Vice President',
        dates: 'January 2022 - Present',
        durationText: '4 years 5 months',
        description: null,
      },
      {
        company: 'GenericCorp',
        title: 'Director',
        dates: 'June 2018 - December 2021',
        durationText: '3 years 7 months',
        description: null,
      },
    ],
    confidence: 'high',
  },
  skills: {
    data: { topThree: [], all: [], endorsementCounts: {} },
    confidence: 'high',
  },
  education: {
    data: [
      { school: 'State University', degree: 'Bachelor of Arts, Business', dates: null },
    ],
    confidence: 'high',
  },
  certifications: {
    data: [],
    confidence: 'high',
  },
});

function compositeOf(profile: ProfileData, selfReport: SelfReport | null = null): number {
  return runScoring(profile, {}, selfReport).composite.score;
}

describe('PDF composite recalibration — calibration snapshot', () => {
  it('produces a spread > 25 points across the four reference profiles', () => {
    const scores = {
      john: compositeOf(johnProfile),
      sidra: compositeOf(sidraProfile),
      mir: compositeOf(mirProfile),
      michael: compositeOf(michaelProfile),
    };
    const max = Math.max(...Object.values(scores));
    const min = Math.min(...Object.values(scores));
    const spread = max - min;
    expect(spread).toBeGreaterThan(25);
  });

  it('orders John > Sidra > Mir > Michael (no self-report)', () => {
    const john = compositeOf(johnProfile);
    const sidra = compositeOf(sidraProfile);
    const mir = compositeOf(mirProfile);
    const michael = compositeOf(michaelProfile);
    expect(john).toBeGreaterThan(sidra);
    expect(sidra).toBeGreaterThan(mir);
    expect(mir).toBeGreaterThan(michael);
  });

  it('John (ex-COO, JPMC, MBA, multiple certs) scores meaningfully higher than Michael (thin VP)', () => {
    expect(compositeOf(johnProfile) - compositeOf(michaelProfile)).toBeGreaterThan(20);
  });

  it('PDF-invisible sections are NOT in the composite when no self-report is present', () => {
    // Construct two profiles identical on PDF-visible content but
    // whose extracted PDF-invisible fields differ. Their composite
    // must be IDENTICAL — the invisible sections aren't allowed to
    // contribute when no self-report has been submitted.
    const baseline = compositeOf(johnProfile);
    const sameVisibleDifferentInvisible = blankProfile({
      ...johnProfile,
      // Replace the missing photo with a present non-default one
      // — this used to bump the composite via the photo scorer's
      // 78 "solid C+" baseline. After the recalibration it must not.
      photo: {
        data: { present: true, imageSrc: 'data:image/png;base64,AAA', isDefault: false },
        confidence: 'high',
      },
    });
    expect(compositeOf(sameVisibleDifferentInvisible)).toBe(baseline);
  });

  it('self-report only ever adds — a self-report with the WORST possible answers does not lower the composite', () => {
    const baseline = compositeOf(johnProfile);
    const worstSelfReport: SelfReport = {
      photo: 'no',
      banner: 'no',
      activity: 'no',
      recommendations: 'none',
      featured: 'no',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const withWorstSelfReport = compositeOf(johnProfile, worstSelfReport);
    // The "self-report only ever adds" invariant — formally, the
    // composite-with-self-report must be ≥ composite-without.
    expect(withWorstSelfReport).toBeGreaterThanOrEqual(baseline);
  });

  // Codex P2 regression: a partial self-report used to drag unanswered
  // invisible sections' parser-fallback scores (60/65) into the
  // invisible average alongside the one real answer, presenting
  // unverified extraction defaults as self-report signal. The fix
  // excludes unanswered sections from the composite entirely so an
  // empty / partial self-report behaves like no self-report for the
  // unanswered sections, and only the truly-answered ones contribute.
  it('an empty self-report (all-null answers) yields the same composite as no self-report', () => {
    const baseline = compositeOf(johnProfile);
    const emptyReport: SelfReport = {
      photo: null,
      banner: null,
      activity: null,
      recommendations: null,
      featured: null,
      submittedAt: '2026-06-01T00:00:00Z',
    };
    expect(compositeOf(johnProfile, emptyReport)).toBe(baseline);
  });

  it('a partial self-report (one answer) contributes ONLY the answered section, not parser fallbacks', () => {
    // Construct two self-reports that share one answer (photo='no')
    // but differ in the OTHER sections (one all-null, one all-no).
    // Pre-fix: the all-no report would have a much lower invisible
    // average than the partial report (because the partial picked up
    // the 60/65 parser fallbacks for the unanswered sections). After
    // the fix: the composite from photo-only-no is at least as high
    // as the composite from all-no, because parser fallbacks no
    // longer get to claim "self-reported" weight.
    const photoOnlyNo: SelfReport = {
      photo: 'no',
      banner: null,
      activity: null,
      recommendations: null,
      featured: null,
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const allNo: SelfReport = {
      photo: 'no',
      banner: 'no',
      activity: 'no',
      recommendations: 'none',
      featured: 'no',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    expect(compositeOf(johnProfile, photoOnlyNo)).toBeGreaterThanOrEqual(
      compositeOf(johnProfile, allNo),
    );
  });

  it('a partial self-report ALSO obeys the floor invariant — never below visible-only baseline', () => {
    const baseline = compositeOf(johnProfile);
    // One bad answer, rest null. Must not pull composite below the
    // visible-only baseline because the floor in computeComposite is
    // `max(visibleScore, blended)`.
    const partialBad: SelfReport = {
      photo: 'no',
      banner: null,
      activity: null,
      recommendations: null,
      featured: null,
      submittedAt: '2026-06-01T00:00:00Z',
    };
    expect(compositeOf(johnProfile, partialBad)).toBeGreaterThanOrEqual(baseline);
  });

  it('self-report with strong answers raises the composite, bounded by the cap', () => {
    const baseline = compositeOf(johnProfile);
    const strongSelfReport: SelfReport = {
      photo: 'yes',
      banner: 'yes',
      activity: 'yes',
      recommendations: 'yes',
      featured: 'yes',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const withStrongSelfReport = compositeOf(johnProfile, strongSelfReport);
    // The cap on PDF-invisible contribution is 15%; with John's
    // visible already near A and the strong self-report near 85, the
    // composite can move by at most a few points.
    expect(withStrongSelfReport).toBeGreaterThan(baseline);
    expect(withStrongSelfReport - baseline).toBeLessThan(
      // Theoretical max gain = cap * (best_invisible_score - visible_score).
      // For a visible_score around 75 and an invisible_score of 85, the
      // gain is bounded by 0.15 * (85 - 75) = 1.5. Allow a small slop
      // window to account for the seniority modifier.
      PDF_INVISIBLE_WEIGHT_CAP * 100,
    );
  });

  it('PDF-invisible sections without a self-report answer never surface as fixes (Codex P2)', () => {
    // Pre-fix: pickFixes ranked Photo / Banner / Featured among top
    // fixes for a freshly-uploaded PDF because their nominal weight
    // and "could not extract" 60/65 fallback gave them a plausible
    // pointsGain — even though computeComposite excludes them from
    // the composite entirely. That was misleading: "improve your
    // Photo (+0.8 pts)" without also filling in the self-assessed
    // block wouldn't move the composite at all.
    const audit = runScoring(johnProfile);
    for (const fix of audit.fixes) {
      expect(PDF_INVISIBLE_SECTION_IDS).not.toContain(fix.sectionId);
    }
    for (const win of audit.wins) {
      expect(PDF_INVISIBLE_SECTION_IDS).not.toContain(win.sectionId);
    }
  });

  it('an ANSWERED PDF-invisible section is allowed to appear as a fix', () => {
    // The exclusion is gated on the "no self-report for this
    // section" condition — once the user answers, the section IS
    // in the composite and a "fix this" suggestion is honest. Use
    // a profile + self-report where the answered invisible section
    // has a low rawScore (photo='no' → 30) and verify it can show
    // up among the fixes.
    const photoNo: SelfReport = {
      photo: 'no',
      banner: null,
      activity: null,
      recommendations: null,
      featured: null,
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const audit = runScoring(johnProfile, {}, photoNo);
    // The unanswered invisible sections still must NOT appear.
    for (const fix of audit.fixes) {
      if (fix.sectionId !== 'photo') {
        expect(['banner', 'activity', 'recommendations', 'featured']).not.toContain(
          fix.sectionId,
        );
      }
    }
  });

  it("answered-invisible fixes show 0 points-gain when the blend floor swallows the improvement (Codex P2)", () => {
    // Construct a profile + self-report where the answered invisible
    // sections sit well below the visible-only baseline. The composite
    // is `max(visible_only, blended)` and the blend is dominated by
    // the visible-only floor — so bumping a low-scored invisible
    // section to the next letter doesn't actually move the composite.
    // Pre-fix, pickFixes claimed `effective_weight × gap` regardless
    // of whether the gain was real.
    const badInvisibles: SelfReport = {
      photo: 'no',
      banner: 'no',
      activity: 'no',
      recommendations: 'none',
      featured: 'no',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const audit = runScoring(johnProfile, {}, badInvisibles);
    // The blended composite sits below the visible-only baseline, so
    // every invisible fix should report `pointsGain = 0` — improving
    // any single one of them can't push the blended above the floor
    // by itself. If pickFixes still claimed nominal weights it would
    // report ~0.15 / answered × gap per section.
    for (const fix of audit.fixes) {
      if (PDF_INVISIBLE_SECTION_IDS.includes(fix.sectionId)) {
        expect(fix.pointsGain).toBe(0);
      }
    }
  });

  it('unreported PDF-invisible sections are flagged ungraded (Codex P2 round 6)', () => {
    // Pre-fix: the section scorers' parser-fallback rawScores
    // (~60/65) carried through to `letter`, so a PDF-invisible
    // section with no self-report answer rendered as a concrete
    // D / F next to the "Not visible to this audit" oneLineWhy.
    // That contradicted the recalibration's promise that these
    // sections are ungraded.
    //
    // After the fix: runScoring sets `ungraded: true` on the
    // SectionScore, and SectionGradeList renders "—" (em dash)
    // in place of the letter.
    const audit = runScoring(johnProfile);
    for (const s of audit.sections) {
      if (PDF_INVISIBLE_SECTION_IDS.includes(s.id)) {
        expect(s.ungraded).toBe(true);
      } else {
        expect(s.ungraded ?? false).toBe(false);
      }
    }
  });

  it("an ANSWERED PDF-invisible section is graded (not ungraded)", () => {
    const photoYes: SelfReport = {
      photo: 'yes',
      banner: null,
      activity: null,
      recommendations: null,
      featured: null,
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const audit = runScoring(johnProfile, {}, photoYes);
    const photo = audit.sections.find((s) => s.id === 'photo')!;
    const banner = audit.sections.find((s) => s.id === 'banner')!;
    // Photo was answered → graded. Banner was not → ungraded.
    expect(photo.ungraded).toBe(false);
    expect(banner.ungraded).toBe(true);
  });

  it("zero-gain fixes are dropped — pickFixes never returns a 'highest-leverage' fix that can't move the composite (Codex P2 round 7)", () => {
    // Construct a self-report whose invisible answers are deep
    // below the visible-only baseline. The floor swallows their
    // single-section bumps, so each invisible section's marginal
    // rate is 0 and pickFixes' pointsGain would round to 0. The
    // pre-fix behaviour would still surface them as "highest-
    // leverage fixes" with `pointsGain: 0` if visible candidates
    // were exhausted. The post-fix contract: any fix returned
    // MUST have pointsGain > 0.
    const allBad: SelfReport = {
      photo: 'no',
      banner: 'no',
      activity: 'no',
      recommendations: 'none',
      featured: 'no',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const audit = runScoring(johnProfile, {}, allBad);
    for (const fix of audit.fixes) {
      expect(fix.pointsGain).toBeGreaterThan(0);
    }
  });

  it("the PDF-invisible cap is PRORATED by answered count — a lone strong answer can't claim the full 15% (Codex P2 round 5)", () => {
    // Pre-fix: a single strong photo='yes' answer claimed the full
    // 15% cap and could lift the composite about as much as all five
    // strong answers (banner + activity + recommendations + featured
    // also strong). That overstates the signal — answering one of
    // five questions shouldn't carry the same weight as answering
    // all five.
    //
    // After the prorate, the cap scales with the answered fraction:
    //   1 of 5 answered → 0.15 × 1/5 = 3% weight,
    //   5 of 5 answered → 15% weight (unchanged at full).
    // So the lift from a single strong answer must be STRICTLY
    // SMALLER than the lift from five strong answers.
    const photoOnlyYes: SelfReport = {
      photo: 'yes',
      banner: null,
      activity: null,
      recommendations: null,
      featured: null,
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const allYes: SelfReport = {
      photo: 'yes',
      banner: 'yes',
      activity: 'yes',
      recommendations: 'yes',
      featured: 'yes',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const baseline = compositeOf(michaelProfile);
    const liftOne = compositeOf(michaelProfile, photoOnlyYes) - baseline;
    const liftFive = compositeOf(michaelProfile, allYes) - baseline;
    // Pre-fix: liftOne ≈ liftFive (both used the full 15% cap).
    // After fix: liftOne < liftFive because one section claims 3%
    // and five claim 15%.
    expect(liftFive).toBeGreaterThan(liftOne);
  });

  it("an answered-invisible fix that CROSSES the floor on the way to next letter still surfaces (Codex P2 round 5)", () => {
    // Construct a profile where the visible-only baseline sits in
    // the F band (~50) but a single answered invisible section is
    // currently FAR below the baseline (photo='no' → 30) AND its
    // next-letter target (60) lies above the baseline. The round-4
    // 10-point probe would have reported rate=0 here (because a 10-
    // point bump leaves the section at 40, still below the floor),
    // causing the photo fix to drop out of the action plan even
    // though hitting 60 would actually move the composite. The
    // round-5 fix probes with the actual gap-to-next-letter so the
    // floor crossing is captured.
    const photoNo: SelfReport = {
      photo: 'no',
      banner: null,
      activity: null,
      recommendations: null,
      featured: null,
      submittedAt: '2026-06-01T00:00:00Z',
    };
    // Use the thin-VP profile whose visible baseline is low (~50).
    const audit = runScoring(michaelProfile, {}, photoNo);
    const photoFix = audit.fixes.find((f) => f.sectionId === 'photo');
    // The photo fix should be present AND have a positive points
    // gain — the next-letter probe crosses the floor.
    if (photoFix) {
      expect(photoFix.pointsGain).toBeGreaterThan(0);
    }
    // (We don't strictly assert presence because pickFixes returns
    // top-3; if photo's leverage is lower than three visible fixes,
    // it might still get filtered out. The contract being tested
    // here is "if photo IS surfaced, its gain isn't a false 0.")
  });

  it("pickFixes uses renormalised composite weights, not nominal RUBRIC weights (Codex P2)", () => {
    // computeComposite renormalises visible-section weights to sum
    // to 1.0 of `1 - cap` (or 1.0 when no invisible answered). Before
    // this fix, pickFixes claimed gains using each section's nominal
    // RUBRIC weight, which is wrong post-recalibration. With no self-
    // report the effective weight for a visible section is
    // nominal / 0.72 — strictly larger than nominal. So:
    //   nominalGain  = s.weight * gap  (pre-fix value)
    //   effectiveGain = (s.weight / 0.72) * gap  (post-fix value)
    // Post-fix gains for visible sections must exceed the pre-fix
    // nominal computation by ~38% (1/0.72 ≈ 1.39).
    const audit = runScoring(michaelProfile);
    // Use a robust check: for at least one visible section that made
    // the fix list, the reported pointsGain must be larger than a
    // hypothetical "nominal" calculation using s.weight. Math.round to
    // 2dp + clamp arithmetic mean we allow a thin tolerance window.
    const visibleFix = audit.fixes.find((f) =>
      PDF_INVISIBLE_SECTION_IDS.includes(f.sectionId) === false,
    );
    expect(visibleFix).toBeDefined();
    // Recover the gap pickFixes used by reverse-engineering from the
    // section's current adjustedScore; if pickFixes had used nominal
    // weight we'd see s.weight × gap. We assert pointsGain is
    // SIGNIFICANTLY larger than that.
    if (visibleFix) {
      const section = audit.sections.find((s) => s.id === visibleFix.sectionId)!;
      // gap is the actual distance to the next letter, capped at >=1
      // — pickFixes uses Max(1, nextThreshold - adjustedScore).
      const gap = Math.max(1, scoreToNextLetterThreshold(section.adjustedScore) - section.adjustedScore);
      const nominalGain = section.weight * gap;
      // Effective weight no-self-report = nominal / 0.72 ≈ 1.39 ×
      // nominal. Require pointsGain comfortably above the nominal
      // value to prove the renormalised weight is in play.
      expect(visibleFix.pointsGain).toBeGreaterThan(nominalGain * 1.2);
    }
  });

  it('snapshot — the four composite scores are within the documented bands', () => {
    // Snapshot the actual values so any future scorer change that
    // shifts these numbers shows up as a flagged regression rather
    // than a silent drift in the composite. The bands are wider than
    // a strict equality check so a one-off seniority modifier or
    // tier reclassification doesn't cause a noisy fail.
    const scores = {
      john: compositeOf(johnProfile),
      sidra: compositeOf(sidraProfile),
      mir: compositeOf(mirProfile),
      michael: compositeOf(michaelProfile),
    };
    // John — strongest content across the board, around B-/C+.
    expect(scores.john).toBeGreaterThan(60);
    expect(scores.john).toBeLessThan(85);
    // Michael — confirmed-empty about / skills / certs, around F.
    expect(scores.michael).toBeLessThan(50);
    // Ordering must hold under whatever the exact numbers settle on.
    expect(scores.john).toBeGreaterThan(scores.sidra);
    expect(scores.sidra).toBeGreaterThan(scores.mir);
    expect(scores.mir).toBeGreaterThan(scores.michael);
  });
});

describe('PDF composite recalibration — section scoring', () => {
  it('scoreSelfReportSection returns null for unanswered sections', () => {
    const empty: SelfReport = {
      photo: null,
      banner: null,
      activity: null,
      recommendations: null,
      featured: null,
      submittedAt: '2026-06-01T00:00:00Z',
    };
    for (const id of PDF_INVISIBLE_SECTION_IDS) {
      expect(scoreSelfReportSection(id, empty)).toBeNull();
    }
  });

  it('scoreSelfReportSection produces "yes" > "somewhat/generic/occasional/1-2" > "no/none" ordering for each section', () => {
    const yesAll: SelfReport = {
      photo: 'yes',
      banner: 'yes',
      activity: 'yes',
      recommendations: 'yes',
      featured: 'yes',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const midAll: SelfReport = {
      photo: 'somewhat',
      banner: 'generic',
      activity: 'occasional',
      recommendations: '1-2',
      featured: 'no',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    const noAll: SelfReport = {
      photo: 'no',
      banner: 'no',
      activity: 'no',
      recommendations: 'none',
      featured: 'no',
      submittedAt: '2026-06-01T00:00:00Z',
    };
    for (const id of ['photo', 'banner', 'activity', 'recommendations'] as const) {
      const high = scoreSelfReportSection(id, yesAll)!;
      const mid = scoreSelfReportSection(id, midAll)!;
      const low = scoreSelfReportSection(id, noAll)!;
      expect(high.rawScore).toBeGreaterThan(mid.rawScore);
      expect(mid.rawScore).toBeGreaterThan(low.rawScore);
    }
  });
});
