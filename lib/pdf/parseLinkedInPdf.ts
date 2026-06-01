// Side-effect imports: must be the FIRST imports in this file, BEFORE
// anything that might transitively touch pdfjs-dist. They install
// canvas-globals stubs (DOMMatrix / Path2D / ImageData) and the
// pdfjsWorker handler (so pdfjs-dist's fake-worker setup skips its
// runtime dynamic import of pdf.worker.mjs, which Vercel can't
// resolve). Named exports are imported in addition to the bare
// side-effect import so the lines cannot be tree-shaken.
import { installCanvasStubs, canvasGlobalsState } from './installCanvasStubs';
import { ensurePdfjsWorkerHandler, pdfjsWorkerState } from './disablePdfjsWorker';

import type { ProfileData } from '@/lib/engine/types';
import { parseLinkedInText, type ParseLinkedInOptions } from './parseLinkedInText';

/**
 * Extract text from a LinkedIn "Save to PDF" export and parse it into a
 * `ProfileData`. Server-only — `pdf-parse` (and its underlying
 * `pdfjs-dist`) shouldn't be bundled into client code.
 *
 * The library import is lazy so the module is safe to import from
 * server components that may also be statically analysed at build time.
 *
 * Canvas-globals stubbing is done at THREE points (side-effect import
 * above, top-level call below, and an in-function re-install) so any
 * import-order or bundler quirk on Vercel's runtime can't leave us
 * with an unstubbed DOMMatrix when `pdf-parse` loads.
 */
export async function parseLinkedInPdf(
  pdfBuffer: ArrayBuffer | Uint8Array | Buffer,
  options: ParseLinkedInOptions = {},
): Promise<ProfileData> {
  // In-function belt-and-suspenders installs. If a module-load
  // side-effect above somehow didn't run (cold-start ordering,
  // bundler-induced re-instantiation, dev HMR), these catch the
  // gap before the dynamic pdf-parse import below.
  const canvasInstall = installCanvasStubs();
  const workerInstall = ensurePdfjsWorkerHandler();
  const canvasBefore = canvasGlobalsState();
  const workerBefore = pdfjsWorkerState();
  console.log(
    `[parseLinkedInPdf] pre-import canvas state: ${JSON.stringify(canvasBefore)} (function-call install: installed=[${canvasInstall.installed.join(',')}] preExisting=[${canvasInstall.preExisting.join(',')}])`,
  );
  console.log(
    `[parseLinkedInPdf] pre-import worker state: ${JSON.stringify(workerBefore)} (function-call install: installed=${workerInstall.installed} preExisting=${workerInstall.preExisting})`,
  );

  const { PDFParse } = await import('pdf-parse');

  const canvasAfter = canvasGlobalsState();
  const workerAfter = pdfjsWorkerState();
  console.log(
    `[parseLinkedInPdf] post-import canvas state: ${JSON.stringify(canvasAfter)}`,
  );
  console.log(
    `[parseLinkedInPdf] post-import worker state: ${JSON.stringify(workerAfter)}`,
  );

  const data =
    pdfBuffer instanceof Uint8Array
      ? pdfBuffer
      : new Uint8Array(pdfBuffer as ArrayBuffer);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return parseLinkedInText(result.text, options);
  } finally {
    await parser.destroy().catch(() => {
      // pdfjs occasionally rejects destroy() on transient state; ignore
      // because the parse already succeeded or threw upstream.
    });
  }
}

export { parseLinkedInText } from './parseLinkedInText';
export type { ParseLinkedInOptions } from './parseLinkedInText';
