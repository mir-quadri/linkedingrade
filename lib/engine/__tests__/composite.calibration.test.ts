import { describe, expect, it } from 'vitest';

import type { ProfileData } from '@/lib/engine/types';
import type { SelfReport } from '@/lib/storage/auditStore';
import { runScoring } from '@/lib/engine/scoring';
import {
  PDF_INVISIBLE_WEIGHT_CAP,
  scoreSelfReportSection,
} from '@/lib/engine/scoring/pdfCompositeConfig';
import { PDF_INVISIBLE_SECTION_IDS } from '@/lib/engine/scoring/weights';

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
