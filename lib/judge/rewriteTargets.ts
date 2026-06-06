import type { JudgeRequest } from '@/lib/engine/types/judge';

/**
 * Pick the 4-section PDF MVP rewrite targets that are GROUNDED in the
 * outgoing `judgeRequest` — i.e. the proxy actually has source text
 * for them. Asking the model to rewrite a section we didn't send text
 * for invites a fabricated before/after that `pickFixes` would attach
 * as an ungrounded rewrite in the post-gate report. (Codex Round 3 P2
 * on PR #19.)
 *
 * Scope is intentionally narrow: Headline + About only. Career Arc /
 * Current Experience are not AI-judged in the 4-section MVP, so they
 * never get rewrites here regardless of what's in the request — that
 * scope expansion lands when (and if) the cost data supports it.
 */
export function pickGroundedRewriteTargets(
  request: JudgeRequest,
): Array<'headline' | 'about'> {
  // Trim before checking. `buildJudgeRequest` already trims in-tree,
  // but the helper is exported and may run on requests from less-
  // tidy sources (a future extension caller, hand-built JSON, etc.).
  // `{ text: '   ' }` and `{ text: null }` must both decline rewrite —
  // there's no source text to ground a `before` excerpt in.
  const targets: Array<'headline' | 'about'> = [];
  if (request.headline?.text?.trim()) targets.push('headline');
  if (request.about?.text?.trim()) targets.push('about');
  return targets;
}
