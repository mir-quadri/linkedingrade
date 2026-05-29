import { NextResponse } from 'next/server';

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
  const updated = await store.attachSelfReport(auditId, selfReport);
  if (!updated) {
    return NextResponse.json(
      { error: 'Audit not found or expired.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, selfReport });
}
