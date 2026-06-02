import { NextResponse } from 'next/server';

import { sendAuditEmail } from '@/lib/email/sendAuditEmail';
import { runPdfAudit } from '@/lib/engine/scoring';
import { getAuditStore } from '@/lib/storage/auditStore';
import { extractIp, hashIp } from '@/lib/audit/hashIp';

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
  // Once a record has been gated (email set on the record), the gate is
  // a one-way transition: subsequent attach attempts must be refused.
  // Otherwise anyone with the permanent /audit/result/<id> URL could
  // POST here with that auditId, replace the stored email + UA + IP
  // hash, and trigger a fresh Resend send to themselves — effectively a
  // "send this audit to any email" capability for whoever sees the
  // link (forwarded email, shared URL, browser history). The result URL
  // is intended to be a read-only permanent link, not a re-send button.
  const existing = await store.get(auditId);
  if (!existing) {
    return NextResponse.json(
      {
        error:
          "We couldn't find that audit — it may have expired. Re-upload your PDF to start again.",
      },
      { status: 404 },
    );
  }
  if (existing.email) {
    return NextResponse.json(
      {
        error:
          'This audit has already been emailed. Re-upload your PDF to run a fresh audit.',
      },
      { status: 409 },
    );
  }

  const emailedAt = new Date().toISOString();
  // The email submit IS the consent moment, so this is the right
  // place to capture user-agent and the hashed IP — matches the
  // privacy policy's "If you submit your email, we also store ..."
  // wording. Upload-only visitors don't reach this path and so don't
  // have UA / IP hash retained.
  const userAgent = request.headers.get('user-agent');
  const ipHash = hashIp(extractIp(request.headers));
  const updated = await store.attachEmail(auditId, email, emailedAt, userAgent, ipHash);
  if (!updated) {
    // attachEmail returns null only when the record has expired between
    // the `get` above and this write — vanishingly rare but possible.
    return NextResponse.json(
      {
        error:
          "We couldn't find that audit — it may have expired. Re-upload your PDF to start again.",
      },
      { status: 404 },
    );
  }

  // New records are stamped `auditMode: 'pdf'`. Legacy records (saved before
  // the focused audit shipped) hold a full 12-section audit; recompute the
  // focused 4-section audit from their stored profile so the email and the
  // inline report stay consistent with the 4-section renderer. Mirrors the
  // result page's fallback. No AI judge is involved yet, so it's lossless.
  const { profile: reportProfile, audit: reportAudit } =
    updated.auditMode === 'pdf'
      ? { profile: updated.profile, audit: updated.audit }
      : runPdfAudit(updated.profile);

  // Fire-and-fail-soft. The audit is already persisted; the report renders
  // on-page either way. An email-send failure must not block the gate.
  const origin = new URL(request.url).origin;
  const resultUrl = `${origin}/audit/result/${auditId}`;
  const emailed = await sendAuditEmail({
    email,
    fullName: reportProfile.fullName,
    audit: reportAudit,
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
    profile: reportProfile,
    audit: reportAudit,
  });
}
