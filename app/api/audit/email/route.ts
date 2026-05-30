import { NextResponse } from 'next/server';

import { sendAuditEmail } from '@/lib/email/sendAuditEmail';
import { getAuditStore } from '@/lib/storage/auditStore';

export const runtime = 'nodejs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auditId =
    typeof payload === 'object' && payload !== null && 'auditId' in payload
      ? String((payload as { auditId: unknown }).auditId ?? '').trim()
      : '';
  const email =
    typeof payload === 'object' && payload !== null && 'email' in payload
      ? String((payload as { email: unknown }).email ?? '').trim()
      : '';

  if (!auditId) {
    return NextResponse.json({ error: 'Missing audit id.' }, { status: 400 });
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "That doesn't look like a valid email." }, { status: 400 });
  }

  const store = await getAuditStore();
  const emailedAt = new Date().toISOString();
  const updated = await store.attachEmail(auditId, email, emailedAt);
  if (!updated) {
    return NextResponse.json(
      {
        error:
          "We couldn't find that audit — it may have expired. Re-upload your PDF to start again.",
      },
      { status: 404 },
    );
  }

  // Fire-and-fail-soft. The audit is already persisted; the report renders
  // on-page either way. An email-send failure must not block the gate.
  const origin = new URL(request.url).origin;
  const resultUrl = `${origin}/audit/result/${auditId}`;
  const emailed = await sendAuditEmail({
    email,
    fullName: updated.profile.fullName,
    audit: updated.audit,
    resultUrl,
  });

  // Return the full report payload here — the email submit IS the gate,
  // so the client receives the gated data in the response to the
  // gate-clearing request. Without this, AuditFlow would have no way to
  // reveal the full report inline without a second authenticated lookup.
  return NextResponse.json({
    success: true,
    emailed,
    resultUrl,
    profile: updated.profile,
    audit: updated.audit,
  });
}
