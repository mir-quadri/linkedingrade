import type { ProfileData } from '@/lib/engine/types';
import { parseLinkedInText, type ParseLinkedInOptions } from './parseLinkedInText';

/**
 * Install minimal no-op stubs for the canvas globals pdfjs-dist tries
 * to polyfill from `@napi-rs/canvas`. Locally `@napi-rs/canvas` is
 * usually resolvable via the pdf-parse dependency tree, but Vercel's
 * serverless runtime ships without it (native binary, size limits) —
 * so pdfjs-dist falls through to its "Cannot polyfill DOMMatrix"
 * warning path, leaving `globalThis.DOMMatrix` undefined.
 *
 * That on its own is harmless, but `pdfjs-dist/legacy/build/pdf.mjs`
 * evaluates a module-level `const SCALE_MATRIX = new DOMMatrix();`
 * (around line 15620 in v5.4.296). When DOMMatrix is undefined the
 * whole pdfjs-dist module init throws a ReferenceError, which the
 * /api/audit route surfaces as a 422.
 *
 * Stubs are safe because we only extract TEXT — we never invoke the
 * rendering paths that would actually exercise the matrix / path /
 * image-data math. Any locally-loaded real implementation (from
 * @napi-rs/canvas via the polyfill code) wins, because we only install
 * a stub when the global is `undefined`.
 *
 * Must run BEFORE `await import('pdf-parse')` — pdfjs-dist's
 * module-level code executes synchronously during that import.
 */
function ensurePdfjsCanvasGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === 'undefined') {
    class StubDOMMatrix {
      constructor(_input?: unknown) {}
    }
    g.DOMMatrix = StubDOMMatrix;
  }
  if (typeof g.Path2D === 'undefined') {
    class StubPath2D {
      constructor(_input?: unknown) {}
    }
    g.Path2D = StubPath2D;
  }
  if (typeof g.ImageData === 'undefined') {
    class StubImageData {
      constructor(_w?: unknown, _h?: unknown) {}
    }
    g.ImageData = StubImageData;
  }
}

/**
 * Extract text from a LinkedIn "Save to PDF" export and parse it into a
 * `ProfileData`. Server-only — `pdf-parse` (and its underlying
 * `pdfjs-dist`) shouldn't be bundled into client code.
 *
 * The library import is lazy so the module is safe to import from
 * server components that may also be statically analysed at build time.
 */
export async function parseLinkedInPdf(
  pdfBuffer: ArrayBuffer | Uint8Array | Buffer,
  options: ParseLinkedInOptions = {},
): Promise<ProfileData> {
  ensurePdfjsCanvasGlobals();
  const { PDFParse } = await import('pdf-parse');
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
