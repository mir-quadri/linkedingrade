import type { JudgeRequest } from '@/lib/engine/types/judge';

/**
 * Builds the single, tightly-scoped prompt the judge proxy sends to
 * Claude per audit. The intent is one batched call covering both
 * Headline and About — never a per-section round-trip — so token cost
 * stays predictable and bounded.
 *
 * The four qualitative questions the engine actually needs:
 *
 *   1. Buzzword density (low/medium/high) — both sections + cross-cutting.
 *   2. Cliché detection — the engine penalises cliché openers in About
 *      and any cliché signal in the headline.
 *   3. Hook quality — does the About open with something specific?
 *   4. Voice-is-human — is the language AI-default or a real voice?
 *
 * Plus the structural-only ceiling lift, expressed as the `hasIdentity`
 * / `hasDomain` / `hasCredibleSpecific` flags the engine reads from
 * `HeadlineJudgment`, and the same hook/range/CTA bundle for About.
 *
 * Rewrites are requested ONLY for the sections in `req.rewriteTargets`
 * — usually the lowest-scoring of headline / about. Excluding currentExperience
 * here because the four-section PDF audit's MVP keeps the proxy budget
 * tight; we'll widen if the cost data supports it.
 */
export function buildJudgePrompt(req: JudgeRequest): {
  system: string;
  user: string;
  /** Token budget hint — caller must enforce. The system + user counts here
   * are approximate (~4 chars / token). The hard cap lives in the Anthropic
   * call's `max_tokens`. */
  approximatePromptChars: number;
} {
  const sections: string[] = [];
  if (req.headline?.text) {
    sections.push(`HEADLINE: "${escapeForPrompt(req.headline.text)}"`);
  }
  if (req.about?.text) {
    sections.push(`ABOUT: "${escapeForPrompt(req.about.text)}"`);
  }

  // The targets list is the engine's signal of which sections to rewrite.
  // We honour it directly — never rewriting a section the engine didn't ask
  // about — so the report's "before/after" stays paired with the same
  // sections it scored.
  const rewriteTargets = Array.from(new Set(req.rewriteTargets ?? []))
    .filter((t) => t === 'headline' || t === 'about');

  const roleHint = req.rolesFamilyHint
    ? `Role family (use for keyword expectations only): ${req.rolesFamilyHint}`
    : 'Role family unknown.';

  const system = `You are a senior LinkedIn copy editor. You evaluate two text
fields — Headline and About — and return STRICT JSON only. No prose, no
preamble, no markdown fences. The JSON must match the schema exactly. Keep
notes under 25 words per section. Be honest, not encouraging.`;

  const responseSchema = [
    '{',
    '  "headline": {',
    '    "hasCliche": boolean,         // e.g. "results-driven", "passionate about", "synergistic"',
    '    "hasIdentity": boolean,       // names what the person IS or DOES',
    '    "hasDomain": boolean,         // names the industry / function / what they do it for',
    '    "hasCredibleSpecific": boolean, // a concrete claim a recruiter would verify',
    '    "mobileSafe": boolean,        // essential claim within first ~70 chars',
    '    "notes": string               // <25 words; what would lift this to A',
    '  },',
    '  "about": {',
    '    "hasHook": boolean,           // opens with something specific',
    '    "hasRange": boolean,          // shows the arc of work / breadth',
    '    "hasCTA": boolean,            // ends with a clear call to action',
    '    "voiceIsHuman": boolean,      // not AI-default phrasing',
    '    "buzzwordDensity": "low" | "medium" | "high",',
    '    "notes": string               // <25 words',
    '  },',
    '  "buzzwords": {',
    '    "density": "low" | "medium" | "high",  // overall across headline + about',
    '    "examples": string[],                  // up to 5; the worst offenders',
    '    "notes": string                        // <25 words',
    '  },',
    '  "rewrites": {',
    '    // OPTIONAL — include ONLY the keys in REWRITE_TARGETS below.',
    '    // Each rewrite: { "before": string, "after": string }.',
    '    // - "before" is a SHORT EXCERPT (≤200 chars) of the original you',
    '    //   are rewriting around — usually the opening line/clause. Do NOT',
    '    //   echo the full original; the caller already has it.',
    '    // - "after" is the proposed rewrite. Stay within LinkedIn limits:',
    '    //   headline ≤220 chars; about ≤2600 chars. Be honest, not made-up.',
    '    // - If the original lacks claims to rewrite around honestly, OMIT',
    '    //   this rewrite key entirely. Never echo the original verbatim',
    '    //   into "after" — a no-op rewrite is noise, not feedback.',
    '  }',
    '}',
  ].join('\n');

  const user = [
    sections.join('\n\n'),
    '',
    roleHint,
    '',
    rewriteTargets.length > 0
      ? `REWRITE_TARGETS: ${JSON.stringify(rewriteTargets)}`
      : 'REWRITE_TARGETS: []',
    '',
    'Return JSON only, matching this schema exactly:',
    responseSchema,
  ].join('\n');

  return {
    system,
    user,
    approximatePromptChars: system.length + user.length,
  };
}

function escapeForPrompt(text: string): string {
  // Strip control chars; keep newlines as literal \n inside the quoted block.
  // We DO NOT JSON.stringify here — the model handles user-provided quotes
  // fine inside a quoted block, and JSON-stringifying would double-escape
  // already-escaped sequences.
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
}
