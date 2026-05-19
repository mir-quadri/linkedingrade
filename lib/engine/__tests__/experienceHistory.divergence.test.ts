import { describe, expect, it } from 'vitest';
import { scoreExperienceHistory } from '@/lib/engine/scoring/sections/experienceHistory';
import { buildJudgeRequest } from '@/lib/engine/scoring/index';
import type { ProfileData, ExperienceEntry } from '@/lib/engine/types';

function makeEntry(over: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    title: 'Engineer',
    company: 'Acme',
    dates: 'Jan 2020 - Dec 2022',
    durationText: '2 years 11 months',
    description: null,
    ...over,
  };
}

function makeProfile(args: {
  history: ExperienceEntry[];
  currentRole: ExperienceEntry | null;
}): ProfileData {
  return {
    url: '',
    extractedAt: '2026-05-19T00:00:00Z',
    fullName: 'Test',
    headline: { data: 'Headline', confidence: 'high' },
    photo: { data: null, confidence: 'missing' },
    banner: { data: null, confidence: 'missing' },
    about: { data: null, confidence: 'missing' },
    currentExperience: args.currentRole
      ? { data: args.currentRole, confidence: 'high' }
      : { data: null, confidence: 'high', notes: 'No current role' },
    experienceHistory: { data: args.history, confidence: 'high' },
    skills: { data: null, confidence: 'missing' },
    featured: { data: null, confidence: 'missing' },
    activity: { data: null, confidence: 'missing' },
    recommendations: { data: null, confidence: 'missing' },
    education: { data: null, confidence: 'missing' },
    certifications: { data: null, confidence: 'missing' },
  };
}

describe('scoreExperienceHistory (SYNC-DIVERGENCE from extension)', () => {
  it('keeps history[0] in the past-role pool when there is no current role', () => {
    // Most-recent past role is rich; older role is a stub. Without the
    // conditional slice(1), only the stub would feed the description ratio
    // and the score would tank.
    const rich = makeEntry({
      title: 'Senior Engineer',
      description:
        'Owned the deploy pipeline. Reduced p95 deploys from 18 min to 4 min and shipped multi-region failover. Hired 4 engineers.',
    });
    const stub = makeEntry({ title: 'Engineer', description: null });
    const profile = makeProfile({
      history: [rich, stub],
      currentRole: null,
    });
    const result = scoreExperienceHistory(profile);
    // descRatio = 1/2 (rich has a description, stub does not). That keeps the
    // score in the mid range; the bug-path would have descRatio = 0/1 from
    // the stub alone and trigger the -12 "bare title-and-date" penalty.
    expect(result.rawScore).toBeGreaterThan(60);
    expect(result.reasons.join(' ')).not.toMatch(/bare title-and-date stubs/);
  });

  it('still drops entries[0] when there is a current role', () => {
    // With a current role, entries[0] IS the current role and the past pool
    // should be entries[1..]. A stub-only past pool should fire the -12
    // "bare title-and-date" penalty as before.
    const current = makeEntry({
      title: 'Staff Engineer',
      description: 'Current rich description.',
    });
    const stub = makeEntry({ title: 'Engineer', description: null });
    const profile = makeProfile({
      history: [current, stub],
      currentRole: current,
    });
    const result = scoreExperienceHistory(profile);
    expect(result.reasons.join(' ')).toMatch(/bare title-and-date stubs/);
  });
});

describe('buildJudgeRequest fullText (SYNC-DIVERGENCE)', () => {
  it('keeps history[0] in fullText when there is no current role', () => {
    const recent = makeEntry({
      title: 'Senior Engineer',
      description: 'UNIQUE_RECENT_DESCRIPTION shipped multi-region failover.',
    });
    const older = makeEntry({
      title: 'Engineer',
      description: 'Older role description.',
    });
    const profile = makeProfile({
      history: [recent, older],
      currentRole: null,
    });
    const req = buildJudgeRequest(profile);
    // Without the conditional, history[0]'s description gets stripped from
    // fullText and the AI judge has no signal from the user's freshest role.
    expect(req.fullText?.text ?? '').toContain('UNIQUE_RECENT_DESCRIPTION');
  });

  it('still drops history[0] when there is a current role', () => {
    const current = makeEntry({
      title: 'Staff Engineer',
      description:
        'CURRENT_ROLE_DESCRIPTION owns the deploy pipeline end to end.',
    });
    const older = makeEntry({
      title: 'Engineer',
      description: 'PAST_ROLE_DESCRIPTION.',
    });
    const profile = makeProfile({
      history: [current, older],
      currentRole: current,
    });
    const req = buildJudgeRequest(profile);
    const text = req.fullText?.text ?? '';
    // The current role's description comes from `cur?.description` already
    // and must appear exactly once — it must not be repeated via history[0].
    const occurrences = text.split('CURRENT_ROLE_DESCRIPTION').length - 1;
    expect(occurrences).toBe(1);
    expect(text).toContain('PAST_ROLE_DESCRIPTION');
  });
});
