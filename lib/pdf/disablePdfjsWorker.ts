/**
 * Module-load side-effect: bypass pdfjs-dist's runtime worker import
 * so it falls through to the in-process "fake worker" path.
 *
 * Why this is needed on Vercel:
 *
 *   pdfjs-dist 5.x ships pdf-worker as a SIBLING file
 *   (`pdfjs-dist/legacy/build/pdf.worker.mjs`) that's only ever
 *   reached via a runtime dynamic import:
 *
 *     // inside pdfjs-dist/legacy/build/pdf.mjs ≈ line 21368
 *     const worker = await import(/*webpackIgnore*\/ this.workerSrc);
 *
 *   Vercel's output-file-tracer can't follow a runtime variable
 *   string — it only sees static imports. The sibling worker file
 *   never lands in /var/task/node_modules/, so the dynamic import
 *   throws "Setting up fake worker failed: Cannot find module
 *   /var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
 *   and /api/audit returns 422.
 *
 *   pdfjs-dist's fake-worker setup has a documented escape hatch:
 *   if `globalThis.pdfjsWorker?.WorkerMessageHandler` is present at
 *   the time `#setupFakeWorker` runs, it uses that directly and
 *   skips the dynamic import. We pre-populate it here with a
 *   STATIC import of the worker module — which Vercel's tracer
 *   DOES follow, so the file lands in the deployed function — and
 *   then assign the namespace onto `globalThis.pdfjsWorker`.
 *
 * Worker is functionally unneeded for our use case: we only call
 * `getText()` (text extraction), which is main-thread-safe. The
 * "fake worker" runs the same code on a LoopbackPort instead of a
 * real Worker — no off-thread parsing, just an in-process message
 * loop.
 *
 * `next.config.ts` also adds `outputFileTracingIncludes` for the
 * worker file as belt-and-suspenders, in case the static import
 * isn't enough for the tracer for any reason.
 */

// Static import: this is the line Vercel's output-file-tracer
// follows to decide what to deploy. Even with pdfjs-dist in
// serverExternalPackages (so webpack/turbopack don't bundle it
// into the function), the tracer copies the file into
// /var/task/node_modules/pdfjs-dist/legacy/build/.
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

type GlobalShape = Record<string, unknown>;

function installNow(): { installed: boolean; preExisting: boolean } {
  const g = globalThis as GlobalShape;
  // The check pdfjs-dist runs (see pdf.mjs ≈ line 21357):
  //   try { return globalThis.pdfjsWorker?.WorkerMessageHandler || null; }
  //   catch { return null; }
  // If we set globalThis.pdfjsWorker to the imported namespace, its
  // WorkerMessageHandler is non-null and pdfjs-dist skips the
  // dynamic import entirely.
  if (g.pdfjsWorker && (g.pdfjsWorker as { WorkerMessageHandler?: unknown }).WorkerMessageHandler) {
    return { installed: false, preExisting: true };
  }
  g.pdfjsWorker = pdfjsWorker;
  return { installed: true, preExisting: false };
}

const initialInstall = installNow();
console.log(
  `[parseLinkedInPdf] pdfjsWorker module-load install — installed=${initialInstall.installed} preExisting=${initialInstall.preExisting} hasWorkerMessageHandler=${!!(pdfjsWorker as { WorkerMessageHandler?: unknown }).WorkerMessageHandler}`,
);

/**
 * Idempotent re-install. Belt-and-suspenders entry point for the
 * audit handler.
 */
export function ensurePdfjsWorkerHandler(): { installed: boolean; preExisting: boolean } {
  return installNow();
}

/**
 * Diagnostic helper: returns the typeof globalThis.pdfjsWorker and
 * whether it currently exposes a WorkerMessageHandler.
 */
export function pdfjsWorkerState(): {
  pdfjsWorker: string;
  hasWorkerMessageHandler: boolean;
} {
  const g = globalThis as GlobalShape;
  const pw = g.pdfjsWorker as { WorkerMessageHandler?: unknown } | undefined;
  return {
    pdfjsWorker: typeof g.pdfjsWorker,
    hasWorkerMessageHandler: !!pw?.WorkerMessageHandler,
  };
}
