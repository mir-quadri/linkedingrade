import type { ProfileData, ExperienceEntry, SectionExtraction } from '@/lib/engine/types';

/**
 * Test fixtures for the engine.
 *
 * The 5 `CAPTURED_PROFILES` are ANONYMISED stand-ins for the 5 real LinkedIn
 * PDF audits run through production (PR #15 smoke test). Real PII is NOT
 * committed: contact info is omitted entirely and the names are first-name
 * labels only. The fixtures are representative of the relative profile quality
 * observed in production — they are not verbatim copies of anyone's profile.
 */

function missing<T>(): SectionExtraction<T> {
  return { data: null, confidence: 'missing' };
}

export function makeProfile(over: Partial<ProfileData> = {}): ProfileData {
  return {
    url: '',
    extractedAt: '2026-06-02T00:00:00Z',
    fullName: 'Test Person',
    headline: missing<string>(),
    photo: missing(),
    banner: missing(),
    about: missing<string>(),
    currentExperience: missing<ExperienceEntry>(),
    experienceHistory: missing<ExperienceEntry[]>(),
    skills: missing(),
    featured: missing(),
    activity: missing(),
    recommendations: missing(),
    education: missing(),
    certifications: missing(),
    ...over,
  };
}

export function entry(o: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    title: 'Role',
    company: 'Company',
    dates: 'Jan 2018 - Dec 2021',
    durationText: '4 years',
    description: null,
    ...o,
  };
}

// Shared description / about bodies (no PII).
const RICH_DESC =
  'Led a team of 25 across 3 regions. Grew revenue 40% to $12M and reduced churn from 18% to 9%. Launched 4 products and shipped a platform processing 1B annual transactions at 99.8% uptime.';
const MED_DESC =
  'Managed delivery for a mid-size org. Improved cycle time by 30% and delivered 5 major releases across 2 years working with cross-functional partners.';
const ABOUT_CLEAN =
  'I build operating models that let regulated institutions move fast without breaking trust. Across four global banks over 15 years I have run strategy, pilots, scale and the governance that makes adoption stick. I delivered three enterprise transformations end to end, cut decision cycles from eight weeks to two, and drove measured efficiency gains of fifty percent. I care about building things that work and measuring whether they actually do.';

/**
 * Ordered worst→best is NOT implied here; the smoke test asserts the ranking.
 * Keys are first-name labels matching the PR #15 spec's ranking assertion
 * (Erum > John > Sidra > Mir > Michael).
 */
export const CAPTURED_PROFILES: Record<string, ProfileData> = {
  // Excellent across the board. Name was misparsed by the PDF parser
  // (headline bled into the name slot, pipes present) — the audit flags it
  // low-confidence rather than showing a garbage name.
  Erum: makeProfile({
    fullName: 'Senior Director, Data | Building AI Platforms',
    headline: {
      data: 'Senior Director, Data Science | Building Enterprise AI Platforms | Driving Analytics Strategy | ML & Risk Transformation Leader',
      confidence: 'high',
    },
    about: { data: ABOUT_CLEAN, confidence: 'high' },
    currentExperience: {
      data: entry({ title: 'Senior Director', company: 'BankCo', description: RICH_DESC }),
      confidence: 'high',
    },
    experienceHistory: {
      data: [
        entry({ title: 'Senior Director', company: 'BankCo', description: RICH_DESC }),
        entry({ title: 'Director', company: 'FinCo', description: RICH_DESC }),
        entry({ title: 'Lead', company: 'TechCo', description: MED_DESC }),
      ],
      confidence: 'high',
    },
  }),
  // Strong: pipe-rich keyword-dense headline, substantive about and roles.
  John: makeProfile({
    fullName: 'John N.',
    headline: {
      data: 'Head of Payments | Building High-Performing Teams | Driving Fintech Growth at Scale',
      confidence: 'high',
    },
    about: { data: ABOUT_CLEAN, confidence: 'high' },
    currentExperience: {
      data: entry({ title: 'Head of Payments', company: 'PayCo', description: RICH_DESC }),
      confidence: 'high',
    },
    experienceHistory: {
      data: [
        entry({ title: 'Head of Payments', company: 'PayCo', description: RICH_DESC }),
        entry({ title: 'Director', company: 'BankCo', description: MED_DESC }),
        entry({ title: 'Manager', company: 'FinCo', description: MED_DESC }),
      ],
      confidence: 'high',
    },
  }),
  // Mid-level, solid but not outstanding.
  Sidra: makeProfile({
    fullName: 'Sidra S.',
    headline: {
      data: 'Senior Product Manager at FinTech, focused on payments and growth',
      confidence: 'high',
    },
    about: { data: ABOUT_CLEAN.slice(0, 300), confidence: 'high' },
    currentExperience: {
      data: entry({ title: 'Senior Manager', company: 'FinCo', description: MED_DESC }),
      confidence: 'high',
    },
    experienceHistory: {
      data: [
        entry({ title: 'Senior Manager', company: 'FinCo', description: MED_DESC }),
        entry({ title: 'Manager', company: 'TechCo', description: MED_DESC }),
      ],
      confidence: 'high',
    },
  }),
  // Senior, strong About but thin current-role and history descriptions
  // (duty-list phrasing, bare past roles).
  Mir: makeProfile({
    fullName: 'Mir Q.',
    headline: {
      data: 'Enterprise AI & Transformation Leader | I put AI into production at regulated enterprises.',
      confidence: 'high',
    },
    about: { data: ABOUT_CLEAN, confidence: 'high' },
    currentExperience: {
      data: entry({
        title: 'Transformation Product Manager',
        company: 'Citi',
        description:
          'Responsible for transformation initiatives across the org and stakeholder management.',
      }),
      confidence: 'high',
    },
    experienceHistory: {
      data: [
        entry({
          title: 'Transformation Product Manager',
          company: 'Citi',
          description: 'Responsible for transformation initiatives across the org.',
        }),
        entry({ title: 'Founder', company: 'Privilege Solutions', description: null }),
        entry({ title: 'SVP', company: 'JPMorgan', description: null }),
      ],
      confidence: 'high',
    },
  }),
  // Weakest: bare title headline, empty About, title-only current role,
  // single-role history.
  Michael: makeProfile({
    fullName: 'Michael J.',
    headline: { data: 'VP, Payments Technology at JPMC', confidence: 'high' },
    about: { data: null, confidence: 'high' },
    currentExperience: {
      data: entry({ title: 'VP, Payments Technology', company: 'JPMC', description: null }),
      confidence: 'high',
    },
    experienceHistory: {
      data: [entry({ title: 'VP, Payments Technology', company: 'JPMC', description: null })],
      confidence: 'high',
    },
  }),
};
