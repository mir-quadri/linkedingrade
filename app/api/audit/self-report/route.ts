import { NextResponse } from 'next/server';

import { runScoring } from '@/lib/engine/scoring';
import { getAuditStore, type SelfReport } from '@/lib/storage/auditStore';

export const runtime = 'nodejs';

const PHOTO_VALUES = new Set(['yes', 'somewhat', 'no']);
const BANNER_VALUES = new Set(['yes', 'generic', 'no']);
const ACTIVITY_VALUES = new Set(['yes', 'occasional', 'no']);
const RECS_VALUES = new Set(['yes', '1-2', 'none']);
const FEATURED_VALUES = new Set(['yes', 'no']);

function pick<T extends string>(value: unknown, allowed: Set<string>): T | null {
  if (typeof value !== 'string') return null;
  return allowed.has(value) ? (value as T) : null;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auditId = String((payload as { auditId?: unknown }).auditId ?? '').trim();
  if (!auditId) {
    return NextResponse.json({ error: 'Missing audit id.' }, { status: 400 });
  }

  const raw = (payload as { selfReport?: Record<string, unknown> }).selfReport ?? {};
  const selfReport: SelfReport = {
    photo: pick<'yes' | 'somewhat' | 'no'>(raw.photo, PHOTO_VALUES),
    banner: pick<'yes' | 'generic' | 'no'>(raw.banner, BANNER_VALUES),
    activity: pick<'yes' | 'occasional' | 'no'>(raw.activity, ACTIVITY_VALUES),
    recommendations: pick<'yes' | '1-2' | 'none'>(raw.recommendations, RECS_VALUES),
    featured: pick<'yes' | 'no'>(raw.featured, FEATURED_VALUES),
    submittedAt: new Date().toISOString(),
  };

  const store = await getAuditStore();
  // Email gate: the self-report block is rendered inside the post-gate
  // full report, so a write attempt for a record whose email is still
  // null means someone is talking to the endpoint directly. Refuse, for
  // the same reason `/audit/result/[auditId]` refuses ungated reads.
  const existing = await store.get(auditId);
  if (!existing) {
    return NextResponse.json(
      { error: 'Audit not found or expired.' },
      { status: 404 },
    );
  }
  if (!existing.email) {
    return NextResponse.json(
      { error: 'Submit your email first to unlock the self-assessed block.' },
      { status: 403 },
    );
  }
  // Recompute the audit against the new self-report. The PDF-composite
  // calc folds the answered PDF-invisible sections in at reduced
  // weight (see `lib/engine/scoring/composite.ts`), so the stored
  // composite now reflects the user's self-assessment. A poor
  // self-report can never lower the composite — that's the invariant
  // the composite calc enforces — so this is purely additive signal.
  const recomputedAudit = runScoring(existing.profile, {}, selfReport);
  const updated = await store.attachSelfReport(auditId, selfReport, recomputedAudit);
  if (!updated) {
    return NextResponse.json(
      { error: 'Audit not found or expired.' },
      { status: 404 },
    );
  }
  return NextResponse.json({
    success: true,
    selfReport,
    audit: updated.audit,
  });
}
