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
  // One-shot diagnostic — pairs with the `[api/audit] judge wiring:`
  // line in the route so we can confirm both code paths see the same
  // env state. Remove once verified live on Vercel.
  console.log(
    `[createServerJudge] auditId=${opts.auditId} kind=${secret ? 'HttpJudge' : 'NullJudge'}`,
  );
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
 * Derive the END-USER's client IP from the inbound `/api/audit`
 * headers and pass it to the proxy via a SINGLE `x-real-ip` header.
 *
 * Codex Round 4 P2: do NOT forward the raw `x-forwarded-for` chain.
 * On Vercel, the edge APPENDS the real client IP to whatever the
 * client supplied — chain[0] is then the attacker-supplied value, and
 * since `/api/audit` is unauthenticated a scripted caller could vary
 * that header on every upload and fan out across the proxy's per-IP
 * daily rate-limit buckets. (X-Judge-Auth still gates the proxy, but
 * the fan-out lets one IP exhaust the documented per-IP budget
 * arbitrarily.) Two headers are Vercel-trusted: `x-vercel-forwarded-
 * for` and `x-real-ip` — both are stamped exclusively by the edge,
 * and Vercel strips any client-supplied values before forwarding.
 *
 * Selection order:
 *   1. `x-vercel-forwarded-for` first value (Vercel's verified chain)
 *   2. `x-real-ip` (Vercel's verified single value)
 *   3. nothing → no header forwarded → proxy's rate limit falls back
 *      to its `no-ip` partition (per-instance memory only when no
 *      pepper, per `lib/judge/rateLimit.ts`).
 *
 * Sensitive headers (cookies, authorization, user-agent) are NEVER
 * forwarded — the inner call is server-to-server and must not leak
 * end-user auth into a request whose audit log we control.
 */
function extractClientForwardHeaders(
  inbound: Headers | undefined,
): Record<string, string> | undefined {
  if (!inbound) return undefined;
  // Privacy contract (`app/privacy/page.tsx` — "AI judge service"
  // bullet): the audit pipeline forwards a SHA-256 hash of the IP
  // peppered with the server secret. That hash only exists when
  // `IP_HASH_PEPPER` is set; without the pepper the proxy would use
  // a raw IP in-memory key, which does not match the disclosed
  // contract. Gate forwarding on the pepper so the audit pipeline's
  // behaviour matches the policy in every config it can hit:
  //
  //   - Pepper SET (production):  forward x-real-ip → proxy hashes
  //   - Pepper UNSET (dev/test):  forward nothing → proxy uses
  //                              no-ip → no IP-derived data leaves
  //                              this Vercel function
  if (!process.env.IP_HASH_PEPPER) return undefined;
  let trustedIp: string | null = null;
  const vercelFwd = inbound.get('x-vercel-forwarded-for');
  if (vercelFwd) {
    const first = vercelFwd.split(',')[0]?.trim();
    if (first) trustedIp = first;
  }
  if (!trustedIp) {
    trustedIp = inbound.get('x-real-ip');
  }
  if (!trustedIp) return undefined;
  // Send via the proxy's fallback `x-real-ip` slot. We deliberately
  // do NOT send `x-forwarded-for` — chain[0] of that header is
  // attacker-controlled on Vercel, and even the proxy's `extractIp`
  // (which we tightened in Round 6 to ignore `x-forwarded-for`)
  // historically preferred it.
  return { 'x-real-ip': trustedIp };
}
