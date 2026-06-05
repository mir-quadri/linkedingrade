import { describe, expect, it } from 'vitest';

import { parseJudgeResponse } from '../parseResponse';

const STRICT_OK = JSON.stringify({
  headline: {
    hasCliche: false,
    hasIdentity: true,
    hasDomain: true,
    hasCredibleSpecific: true,
    mobileSafe: true,
    notes: 'Concrete identity + domain claim within mobile cut-off.',
  },
  about: {
    hasHook: true,
    hasRange: true,
    hasCTA: true,
    voiceIsHuman: true,
    buzzwordDensity: 'low',
    notes: 'Opens with a specific outcome; ends with an explicit CTA.',
  },
  buzzwords: {
    density: 'low',
    examples: [],
    notes: 'No flagged buzzwords across either section.',
  },
  rewrites: {
    headline: { before: 'Senior Engineer @ Acme', after: 'Senior Engineer @ Acme | Built X' },
  },
});

describe('parseJudgeResponse', () => {
  it('parses a strict-schema response into the engine JudgeResponse shape', () => {
    const r = parseJudgeResponse(STRICT_OK);
    expect(r.headline?.hasIdentity).toBe(true);
    expect(r.about?.buzzwordDensity).toBe('low');
    expect(r.buzzwords?.density).toBe('low');
    expect(r.rewrites?.headline?.after).toContain('Built X');
  });

  it('tolerates ``` json fenced output', () => {
    const wrapped = '```json\n' + STRICT_OK + '\n```';
    const r = parseJudgeResponse(wrapped);
    expect(r.headline?.hasIdentity).toBe(true);
  });

  it('tolerates a fenced response with leading whitespace/newline (Codex Round 9 P2)', () => {
    // Anthropic occasionally returns "\n```json\n…\n```" with a
    // leading newline. The fence regex is anchored, so without
    // trimming the raw input first the regex misses, JSON.parse
    // receives the backticks, the route reports judge_unavailable for
    // an otherwise-valid upstream response, and the audit silently
    // degrades. Trim BEFORE stripping.
    const leadingWhitespace = '\n  \n```json\n' + STRICT_OK + '\n```\n  ';
    const r = parseJudgeResponse(leadingWhitespace);
    expect(r.headline?.hasIdentity).toBe(true);
    expect(r.about?.buzzwordDensity).toBe('low');
  });

  it('omits headline judgment when any flag is missing — never half-AI / half-fallback', () => {
    const partial = JSON.stringify({
      headline: { hasCliche: false, hasIdentity: true, hasDomain: true, hasCredibleSpecific: true /* missing mobileSafe */ },
      about: {
        hasHook: true,
        hasRange: true,
        hasCTA: false,
        voiceIsHuman: true,
        buzzwordDensity: 'medium',
        notes: 'OK',
      },
    });
    const r = parseJudgeResponse(partial);
    expect(r.headline).toBeUndefined(); // partial → fallback
    expect(r.about?.hasCTA).toBe(false); // about fully present → kept
  });

  it('omits about judgment when buzzwordDensity is invalid', () => {
    const bad = JSON.stringify({
      about: {
        hasHook: true,
        hasRange: true,
        hasCTA: true,
        voiceIsHuman: true,
        buzzwordDensity: 'extreme',
      },
    });
    const r = parseJudgeResponse(bad);
    expect(r.about).toBeUndefined();
  });

  it('omits rewrites entirely when none are well-formed', () => {
    const r = parseJudgeResponse(
      JSON.stringify({ rewrites: { headline: { before: 'X' /* missing after */ } } }),
    );
    expect(r.rewrites).toBeUndefined();
  });

  it('throws ONLY when the whole response is unparseable JSON', () => {
    expect(() => parseJudgeResponse('not json at all')).toThrow();
  });

  it('caps buzzwords.examples at 5 entries to keep client payloads bounded', () => {
    const r = parseJudgeResponse(
      JSON.stringify({
        buzzwords: {
          density: 'high',
          examples: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          notes: 'too many',
        },
      }),
    );
    expect(r.buzzwords?.examples).toHaveLength(5);
  });

  it('coerces non-string examples out of the list', () => {
    const r = parseJudgeResponse(
      JSON.stringify({
        buzzwords: { density: 'low', examples: ['a', 1, 'b', null], notes: '' },
      }),
    );
    expect(r.buzzwords?.examples).toEqual(['a', 'b']);
  });
});
