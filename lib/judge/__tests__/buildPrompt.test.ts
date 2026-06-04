import { describe, expect, it } from 'vitest';

import { buildJudgePrompt } from '../buildPrompt';

describe('buildJudgePrompt', () => {
  it('includes both headline and about text when provided', () => {
    const { user } = buildJudgePrompt({
      headline: { text: 'Senior Engineer @ Acme' },
      about: { text: 'I ship platforms that actually work.' },
      rolesFamilyHint: 'engineering',
      rewriteTargets: ['headline'],
    });
    expect(user).toContain('Senior Engineer @ Acme');
    expect(user).toContain('I ship platforms that actually work.');
    expect(user).toContain('Role family');
    expect(user).toContain('engineering');
  });

  it('honours rewriteTargets — never asks for a rewrite the engine did not ask for', () => {
    const headlineOnly = buildJudgePrompt({
      headline: { text: 'X' },
      rewriteTargets: ['headline'],
    });
    expect(headlineOnly.user).toContain('REWRITE_TARGETS: ["headline"]');
    const aboutOnly = buildJudgePrompt({
      about: { text: 'Y' },
      rewriteTargets: ['about'],
    });
    expect(aboutOnly.user).toContain('REWRITE_TARGETS: ["about"]');
    const none = buildJudgePrompt({ headline: { text: 'Z' }, rewriteTargets: [] });
    expect(none.user).toContain('REWRITE_TARGETS: []');
  });

  it('strips currentExperience rewrites — the four-section PDF MVP keeps the prompt budget tight', () => {
    const { user } = buildJudgePrompt({
      headline: { text: 'X' },
      // The engine's JudgeRequest allows currentExperience as a target, but
      // the proxy prompt deliberately doesn't ask Claude for one — that's
      // out of scope until cost data supports widening.
      rewriteTargets: ['headline', 'currentExperience' as unknown as 'headline'],
    });
    expect(user).toContain('REWRITE_TARGETS: ["headline"]');
    expect(user).not.toContain('currentExperience');
  });

  it('produces a strictly JSON-only system prompt — no markdown, no preamble', () => {
    const { system } = buildJudgePrompt({ headline: { text: 'X' } });
    expect(system).toMatch(/STRICT JSON/);
    expect(system).toMatch(/No prose, no\s+preamble, no markdown fences/);
  });

  it('removes ASCII control characters from user text so quoted-block escaping holds', () => {
    const { user } = buildJudgePrompt({
      headline: { text: 'Headlinewith-controlchars' },
    });
    expect(user).not.toMatch(/[]/);
  });

  it('reports approximatePromptChars for the caller to compare against budgets', () => {
    const { approximatePromptChars } = buildJudgePrompt({
      headline: { text: 'X' },
      about: { text: 'Y' },
    });
    expect(approximatePromptChars).toBeGreaterThan(0);
  });
});
