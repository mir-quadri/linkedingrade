import { NextResponse } from 'next/server';

import { createServerJudge } from '@/lib/judge/createServerJudge';
import { HttpJudge } from '@/lib/judge/httpJudge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only wiring diagnostic for the AI judge.
 *
 * Exists to verify end-to-end that the audit pipeline can construct
 * an HttpJudge in this runtime — i.e. that `JUDGE_PROXY_SECRET` is
 * actually readable from the `/api/audit` runtime context on Vercel.
 *
 * Returns ONLY booleans + the proxy URL the route would call. No
 * secret values, no client identifiers, no audit state — safe to
 * leave behind once verified. Hitting this endpoint produces NO side
 * effects (no proxy call, no audit record, no rate-limit slot).
 *
 * Remove once the live wiring is permanently confirmed.
 */
export async function GET(request: Request) {
  // Construct a judge exactly the way `/api/audit` does, including
  // the same origin derivation. Use a sentinel `auditId` so any
  // accidental log this triggers is obviously a diagnostic call.
  const origin = new URL(request.url).origin;
  const judge = createServerJudge({
    origin,
    auditId: 'aud_diag_probe',
    // No inboundHeaders — we don't want to influence rate-limit
    // counters from this read-only endpoint.
  });

  const judgeKind = judge instanceof HttpJudge ? 'HttpJudge' : 'NullJudge';
  const proxyUrl =
    process.env.JUDGE_PROXY_URL?.trim() || `${origin}/api/judge`;

  return NextResponse.json({
    // What `/api/audit` sees when it tries to wire the judge:
    secretPresent: !!process.env.JUDGE_PROXY_SECRET,
    pepperSet: !!process.env.IP_HASH_PEPPER,
    anthropicKeyPresent: !!process.env.ANTHROPIC_API_KEY,
    proxyUrlOverride: !!process.env.JUDGE_PROXY_URL,
    proxyUrl,
    judgeKind,
    // Build identifier so the response is unambiguous about WHICH
    // deployment answered.
    vercelEnv: process.env.VERCEL_ENV ?? 'unknown',
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    runtime: 'nodejs',
    note: 'Read-only. No side effects. Remove this endpoint once judge wiring is confirmed live.',
  });
}
