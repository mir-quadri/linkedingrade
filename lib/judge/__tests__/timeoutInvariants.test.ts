import { describe, expect, it } from 'vitest';

import { ANTHROPIC_DEFAULT_TIMEOUT_MS } from '../anthropicClient';
import { HTTP_JUDGE_DEFAULT_TIMEOUT_MS } from '../httpJudge';

/**
 * Production-bug guard: the original 12s upstream / 15s caller-side
 * pair failed live audits because real profiles with judgments + 2
 * rewrites consistently took longer than 12s. The raised defaults
 * (30s upstream / 35s caller) need to stay in this order — caller
 * MUST sit above upstream so the upstream times out first and the
 * caller sees a structured `judge_unavailable`, not an abort race.
 */
describe('judge timeout invariants', () => {
  it('Anthropic upstream timeout default is the raised value (≥30s)', () => {
    expect(ANTHROPIC_DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('HttpJudge caller-side timeout default is the raised value (≥35s)', () => {
    expect(HTTP_JUDGE_DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(35_000);
  });

  it('caller-side timeout STAYS above the upstream timeout — upstream must time out first so the caller sees `judge_unavailable`', () => {
    // If this inverts, the caller would abort first and a slow
    // legitimate Anthropic call would be killed before the upstream
    // could return a structured reason. The graceful-fallback
    // contract is the same either way ({}), but the diagnostic
    // signal in logs gets worse (caller-side `timeout` vs
    // upstream-side `judge_unavailable reason=…`).
    expect(HTTP_JUDGE_DEFAULT_TIMEOUT_MS).toBeGreaterThan(ANTHROPIC_DEFAULT_TIMEOUT_MS);
  });

  it('both timeouts fit under the Vercel Pro 60s function cap with headroom', () => {
    // maxDuration = 60 on both routes; nothing should approach the
    // wall.
    expect(ANTHROPIC_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(45_000);
    expect(HTTP_JUDGE_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(50_000);
  });

  it('caller timeout + cold-start + parse + storage budget fits under the route maxDuration (60s)', async () => {
    // Production guard: the route's `export const maxDuration = 60`
    // is a hard wall — anything that exceeds it gets killed mid-
    // flight with no `catch`/`finally` running, which is exactly the
    // failure mode that motivated this PR. The audit route's worst-
    // case path is:
    //   cold-start (~2s)
    //   + parseLinkedInPdf (~3s on a heavy PDF)
    //   + HttpJudge timeout (≤ HTTP_JUDGE_DEFAULT_TIMEOUT_MS)
    //   + runPdfAudit (ms)
    //   + KV store.save (p99 ~3s on Upstash)
    // ≈ 8 + caller_timeout. The caller-side cap must therefore stay
    // at least 8s below maxDuration so legitimate slow paths land
    // inside the budget.
    const MAX_DURATION_MS = 60_000;
    const NON_JUDGE_BUDGET_MS = 8_000;
    expect(HTTP_JUDGE_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(
      MAX_DURATION_MS - NON_JUDGE_BUDGET_MS,
    );

    // Also assert both route files actually set maxDuration = 60.
    // If a future edit drops the export, this test catches it before
    // the production function reverts to the plan default.
    const fs = await import('node:fs/promises');
    const auditRoute = await fs.readFile(
      new URL('../../../app/api/audit/route.ts', import.meta.url),
      'utf8',
    );
    const judgeRoute = await fs.readFile(
      new URL('../../../app/api/judge/route.ts', import.meta.url),
      'utf8',
    );
    expect(auditRoute).toMatch(/export\s+const\s+maxDuration\s*=\s*60\b/);
    expect(judgeRoute).toMatch(/export\s+const\s+maxDuration\s*=\s*60\b/);
  });
});
