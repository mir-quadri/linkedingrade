// Side-effect import: must be the FIRST import in this file, BEFORE
// anything that might transitively touch pdfjs-dist. The module body
// of `./installCanvasStubs` installs no-op DOMMatrix / Path2D /
// ImageData on `globalThis` at module-load time, so by the time the
// `await import('pdf-parse')` below runs, the polyfills are already
// in place and `pdfjs-dist`'s module-level `new DOMMatrix()` cannot
// throw a ReferenceError. The named export is imported in addition
// to the bare side-effect import so the import line cannot be tree-
// shaken — a bare `import './installCanvasStubs'` is technically
// preserved by modern bundlers but the named import is belt-and-
// suspenders for any future bundler config quirk.
import { installCanvasStubs, canvasGlobalsState } from './installCanvasStubs';

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
  // In-function belt-and-suspenders install. If the module-load
  // side-effect above somehow didn't run (cold-start ordering,
  // bundler-induced re-instantiation, dev HMR), this catches it
  // before the dynamic pdf-parse import below.
  const installResult = installCanvasStubs();
  const before = canvasGlobalsState();
  console.log(
    `[parseLinkedInPdf] pre-import canvas state: ${JSON.stringify(before)} (function-call install: installed=[${installResult.installed.join(',')}] preExisting=[${installResult.preExisting.join(',')}])`,
  );

  const { PDFParse } = await import('pdf-parse');

  const after = canvasGlobalsState();
  console.log(
    `[parseLinkedInPdf] post-import canvas state: ${JSON.stringify(after)}`,
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
