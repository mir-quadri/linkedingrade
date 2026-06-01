import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseLinkedInPdf } from '../parseLinkedInPdf';

/**
 * Codex Vercel-runtime regression: pdfjs-dist (loaded via pdf-parse)
 * evaluates a module-level `const SCALE_MATRIX = new DOMMatrix();`
 * during initialisation. When `@napi-rs/canvas` isn't installed
 * (Vercel's serverless runtime), the polyfill code can't populate
 * `globalThis.DOMMatrix`, and the constructor call throws a
 * ReferenceError that surfaces to /api/audit as a 422.
 *
 * `parseLinkedInPdf` installs no-op stubs on globalThis for DOMMatrix /
 * Path2D / ImageData BEFORE the dynamic `pdf-parse` import to keep
 * module initialisation safe. These tests pin that behaviour.
 *
 * We force-delete the globals inside the test so the assertion is
 * meaningful in both environments — locally `@napi-rs/canvas` already
 * populated them, so without this teardown the stub path wouldn't fire.
 */
type GlobalShape = Record<string, unknown>;

const TARGETS = ['DOMMatrix', 'Path2D', 'ImageData'] as const;

describe('parseLinkedInPdf — canvas global stubs (Vercel runtime fix)', () => {
  const originals = new Map<string, unknown>();

  beforeEach(() => {
    const g = globalThis as GlobalShape;
    for (const name of TARGETS) {
      originals.set(name, g[name]);
      delete g[name];
    }
  });
  afterEach(() => {
    const g = globalThis as GlobalShape;
    for (const name of TARGETS) {
      const original = originals.get(name);
      if (original === undefined) {
        delete g[name];
      } else {
        g[name] = original;
      }
    }
    originals.clear();
  });

  it('installs DOMMatrix / Path2D / ImageData on globalThis before pdf-parse loads', async () => {
    // Calling with an obviously invalid buffer will fail downstream
    // inside pdf-parse, but ensurePdfjsCanvasGlobals runs synchronously
    // before that — so the globals must be set even when the parse
    // throws.
    await parseLinkedInPdf(new Uint8Array([0, 1, 2, 3])).catch(() => undefined);
    const g = globalThis as GlobalShape;
    expect(typeof g.DOMMatrix).toBe('function');
    expect(typeof g.Path2D).toBe('function');
    expect(typeof g.ImageData).toBe('function');
  });

  it('stub constructors accept the argument shapes pdfjs-dist module init calls them with', async () => {
    await parseLinkedInPdf(new Uint8Array([0, 1, 2, 3])).catch(() => undefined);
    const g = globalThis as GlobalShape;
    const DOMMatrix = g.DOMMatrix as new (input?: unknown) => unknown;
    const Path2D = g.Path2D as new (input?: unknown) => unknown;
    const ImageData = g.ImageData as new (w?: unknown, h?: unknown) => unknown;
    // The module-level `new DOMMatrix()` at pdfjs-dist:15620 must not
    // throw — this is the exact callsite that produces the 422 on
    // Vercel without the stub.
    expect(() => new DOMMatrix()).not.toThrow();
    expect(() => new DOMMatrix([1, 0, 0, 1, 0, 0])).not.toThrow();
    expect(() => new Path2D()).not.toThrow();
    expect(() => new Path2D('M 0 0')).not.toThrow();
    expect(() => new ImageData(1, 1)).not.toThrow();
  });

  it('does not clobber a pre-existing DOMMatrix (real canvas wins)', async () => {
    const g = globalThis as GlobalShape;
    class FakeRealDOMMatrix {
      tag = 'real';
    }
    g.DOMMatrix = FakeRealDOMMatrix;
    await parseLinkedInPdf(new Uint8Array([0, 1, 2, 3])).catch(() => undefined);
    expect(g.DOMMatrix).toBe(FakeRealDOMMatrix);
  });
});
