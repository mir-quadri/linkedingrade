import type { Judge } from '@/lib/engine/types/judge';
import { NullJudge } from '@/lib/engine/types/judge';

import { HttpJudge, type HttpJudgeOutcome } from './httpJudge';

/**
 * Decide a judge for one audit. Returns:
 *   - `HttpJudge` when `JUDGE_PROXY_SECRET` is configured — production +
 *     any preview deploy with the secret set.
 *   - `NullJudge` otherwise — local dev without the secret, or any
 *     deployment that deliberately runs without the AI judge. The audit
 *     then degrades to today's structural-only output with
 *     `needsReview: true` on AI-pending sections. Same contract the
 *     proxy already guarantees on its own degradation paths.
 *
 * The proxy is deployed alongside the audit route in the same Vercel
 * function, so by default we call the same origin. `JUDGE_PROXY_URL`
 * overrides for split deployments / staging. The caller supplies the
 * request origin because the route handler has it; we don't read
 * `VERCEL_URL` here to avoid a divergence between the URL the browser
 * is talking to and the URL we make the inner call against.
 */
export function createServerJudge(opts: {
  origin: string;
  auditId: string;
  /**
   * The inbound request's headers — used to forward the client-
   * identifying values (`x-forwarded-for`, `x-real-ip`) so the proxy's
   * per-IP daily rate limit partitions by REAL caller. Without this,
   * the Vercel-to-Vercel inner fetch presents no client IP and the
   * proxy collapses every web audit into one shared bucket. (Codex
   * Round 1 P1 on PR #19.)
   */
  inboundHeaders?: Headers;
  onResult?: (outcome: HttpJudgeOutcome) => void;
}): Judge {
  const secret = process.env.JUDGE_PROXY_SECRET;
  if (!secret) {
    // Intentional fall-back, not an error: the audit must keep running.
    // Logged once per upload so an operator can see why grades are
    // structural-only without grepping for absence-of-evidence.
    console.warn(
      '[createServerJudge] JUDGE_PROXY_SECRET unset — using NullJudge (audit will be structural-only).',
    );
    return new NullJudge();
  }
  const url = process.env.JUDGE_PROXY_URL?.trim() || `${opts.origin}/api/judge`;
  return new HttpJudge({
    proxyUrl: url,
    proxySecret: secret,
    auditId: opts.auditId,
    onResult: opts.onResult,
    forwardHeaders: extractClientForwardHeaders(opts.inboundHeaders),
  });
}

/**
 * Pull only the headers the proxy's `extractIp` cares about. We
 * deliberately don't blanket-forward the inbound headers — that would
 * leak cookies, auth, etc. into a server-to-server call.
 */
function extractClientForwardHeaders(
  inbound: Headers | undefined,
): Record<string, string> | undefined {
  if (!inbound) return undefined;
  const out: Record<string, string> = {};
  const xff = inbound.get('x-forwarded-for');
  if (xff) out['x-forwarded-for'] = xff;
  const xri = inbound.get('x-real-ip');
  if (xri) out['x-real-ip'] = xri;
  return Object.keys(out).length > 0 ? out : undefined;
}
