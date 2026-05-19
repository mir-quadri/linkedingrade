import type { ProfileData } from '@/lib/engine/types';
import { parseLinkedInText, type ParseLinkedInOptions } from './parseLinkedInText';

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
