// Side-effect imports: install the canvas globals pdfjs-dist needs
// AND the pdfjsWorker handler that lets pdfjs-dist's fake-worker
// setup skip its runtime dynamic import of pdf.worker.mjs (which
// Vercel can't resolve). Must be the FIRST imports in this file —
// before `parseLinkedInPdf` (whose module also imports them, but
// importing here too means they're in place even if a future
// refactor changes the module-load order, and makes the dependency
// observable at the route level for anyone reading the route).
import '@/lib/pdf/installCanvasStubs';
import '@/lib/pdf/disablePdfjsWorker';

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { parseLinkedInPdf } from '@/lib/pdf/parseLinkedInPdf';
import { runPdfAudit, buildJudgeRequest } from '@/lib/engine/scoring';
import { getAuditStore } from '@/lib/storage/auditStore';
import { buildPreview } from '@/lib/audit/buildPreview';
import { createServerJudge } from '@/lib/judge/createServerJudge';

// Force the Node runtime: pdf-parse / pdfjs-dist depend on Node APIs and
// cannot run on Vercel's Edge runtime.
export const runtime = 'nodejs';

// Vercel Functions cap request bodies at 4.5 MB and reject anything
// larger before the route handler runs (returns a non-JSON 413
// FUNCTION_PAYLOAD_TOO_LARGE the client can't parse cleanly). Keeping
// the server cap well under that — with headroom for multipart-form
// overhead — means anything that reaches this handler is something we
// can actually surface a clean error for. Must stay in sync with
// MAX_MB in `app/components/audit/AuditFlow.tsx`.
const MAX_PDF_BYTES = 4 * 1024 * 1024; // 4 MB

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
    const parsed = await parseLinkedInPdf(buffer);

    // Generate the auditId up front so it can be stamped on the judge
    // request — proxy logs correlate audit → judge call by this id, and
    // the rate-limiter / cost-per-audit accounting downstream needs it
    // even when the judge is the NullJudge fallback.
    const auditId = randomUUID();

    // Call the AI judge BEFORE runPdfAudit so the section scorers see
    // real judgments and the engine can apply the lift-only invariant
    // (Headline + About may lift above the B+ structural ceiling toward
    // A; harsh judgments can never drop a section below its structural
    // floor — see `lib/engine/scoring/sections/headline.ts` / `about.ts`).
    // Failure mode is graceful: HttpJudge resolves to `{}` on any error,
    // and the audit then degrades to today's structural-only output with
    // `needsReview: true`. NEVER throws — the audit must complete even
    // when the proxy is down.
    const judgeRequest = buildJudgeRequest(parsed);
    // 4-section PDF MVP scope: only Headline + About get rewrites. The
    // proxy prompt builder already filters to these, but setting it
    // here documents the web audit's contract and keeps the request
    // tight.
    judgeRequest.rewriteTargets = ['headline', 'about'];
    const judge = createServerJudge({
      origin: new URL(request.url).origin,
      auditId,
      // Forward x-forwarded-for / x-real-ip so the proxy's per-IP
      // daily rate limit partitions by the END-USER's IP, not the
      // Vercel-to-Vercel inner request. Without this, every web audit
      // would share a single bucket and the documented per-IP cap
      // would silently degrade the judge for everyone after ~50 audits
      // (Codex Round 1 P1 on PR #19).
      inboundHeaders: request.headers,
      onResult: (outcome) => {
        const usage = outcome.usage
          ? ` inputTokens=${outcome.usage.inputTokens} outputTokens=${outcome.usage.outputTokens} usd=${outcome.usage.estimatedUsd}`
          : '';
        const reason = outcome.reason ? ` reason=${outcome.reason}` : '';
        console.log(
          `[api/audit] judge auditId=${auditId} status=${outcome.status} elapsedMs=${outcome.elapsedMs}${usage}${reason}`,
        );
      },
    });
    const judgeResponse = await judge.evaluate(judgeRequest);

    // Focused 4-section PDF audit. `runPdfAudit` also applies the name-
    // suspicion guard, returning a normalised profile (name corrected to a
    // neutral placeholder when the parse looks misparsed) — persist THAT
    // profile so storage and the preview share the same fullName. The
    // judge response (`{}` when the proxy is unavailable) flows in here
    // so AI-pending sections lift above their B+ floor when judgments
    // landed, and stay at structural with `needsReview: true` when not.
    const { profile, audit } = runPdfAudit(parsed, judgeResponse);

    const store = await getAuditStore();
    // userAgent / ipHash are intentionally NOT captured here. The
    // privacy policy ties their collection to the email-submit step
    // (the moment the user gives explicit consent). An upload-only
    // visitor who never clears the gate must not have UA / IP hash
    // retained. The /api/audit/email route captures them from its own
    // request headers and passes them to attachEmail.
    await store.save({
      auditId,
      createdAt: new Date().toISOString(),
      email: null,
      emailedAt: null,
      profile,
      audit,
      selfReport: null,
      userAgent: null,
      ipHash: null,
      // Stamp the engine that produced `audit` so the permanent result page
      // can tell new focused-audit records from legacy 12-section ones.
      auditMode: 'pdf',
    });

    // The response intentionally omits the full report — that's gated
    // behind /api/audit/email. Returning the full payload here would let a
    // user inspect DevTools (or call the endpoint directly) and bypass
    // the email gate entirely. The full record is persisted in the audit
    // store; /api/audit/email looks it up and returns it on success.
    return NextResponse.json({
      auditId,
      preview: buildPreview(audit, profile.fullName, profile.nameConfidence),
    });
  } catch (err) {
    // Log both message and stack so Vercel runtime logs surface the
    // real failure site, not just the generic message. Earlier
    // deploys swallowed the underlying ReferenceError for
    // `DOMMatrix` behind the catch's flattened message and made the
    // root cause invisible until we added module-level logging.
    const reason = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[api/audit] parse/score failed: ${reason}\n${stack ?? ''}`);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 422 });
  }
}
