import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { parseLinkedInPdf } from '@/lib/pdf/parseLinkedInPdf';
import { runScoring, buildJudgeRequest } from '@/lib/engine/scoring';
import { getAuditStore } from '@/lib/storage/auditStore';
import { buildPreview } from '@/lib/audit/buildPreview';
import { extractIp, hashIp } from '@/lib/audit/hashIp';

// Force the Node runtime: pdf-parse / pdfjs-dist depend on Node APIs and
// cannot run on Vercel's Edge runtime.
export const runtime = 'nodejs';

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

const GENERIC_ERROR = "We couldn't read that PDF. Make sure it's the LinkedIn 'Save to PDF' export and try again.";

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Upload a PDF file.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Upload a PDF file.' }, { status: 400 });
  }

  // We accept either explicit application/pdf or the .pdf extension, since
  // some browsers/uploaders surface a generic octet-stream content type.
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return NextResponse.json({ error: 'Only PDF files are accepted.' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `PDF is too large. Max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.` },
      { status: 400 },
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  try {
    const profile = await parseLinkedInPdf(buffer);
    // Score with an empty JudgeResponse — the AI judge ships in PR B3.
    // Sections that depend on AI judgment surface their structural grade
    // and `needsReview: true`, which the UI renders with a "*" marker.
    const audit = runScoring(profile);

    const auditId = randomUUID();
    const store = await getAuditStore();
    const userAgent = request.headers.get('user-agent');
    const ipHash = hashIp(extractIp(request.headers));
    await store.save({
      auditId,
      createdAt: new Date().toISOString(),
      email: null,
      emailedAt: null,
      profile,
      audit,
      selfReport: null,
      userAgent,
      ipHash,
    });

    return NextResponse.json({
      auditId,
      preview: buildPreview(audit, profile.fullName),
      fullReport: { profile, audit },
      // The judge-request shape is returned so a future AI-judge endpoint
      // can be invoked from the client without re-parsing the PDF. It's
      // small and serialisable today; if it grows we'll persist it instead.
      judgeRequest: buildJudgeRequest(profile),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[api/audit] parse/score failed: ${reason}`);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 422 });
  }
}
