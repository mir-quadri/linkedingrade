import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Codex Vercel-runtime regression: pdfjs-dist (loaded via pdf-parse)
 * evaluates a module-level `const SCALE_MATRIX = new DOMMatrix();`
 * during initialisation. When `@napi-rs/canvas` isn't installed
 * (Vercel's serverless runtime), the polyfill code can't populate
 * `globalThis.DOMMatrix`, the constructor call throws a
 * ReferenceError, the pdf-parse module load fails, and /api/audit
 * returns 422.
 *
 * The previous in-function-only stub install passed local tests but
 * still 422'd on Vercel — most likely import-order on the bundled
 * lambda. The fix lifts the install to a module-load side-effect
 * (`./installCanvasStubs`) so the globals are in place before any
 * other module imports `pdf-parse`. These tests pin:
 *
 *   1. The module-load install runs as a side-effect on import, with
 *      no explicit call.
 *   2. The exported `installCanvasStubs()` is idempotent and safe
 *      to call from inside the audit handler too (belt-and-braces).
 *   3. A pre-existing real DOMMatrix is NOT clobbered (locally, the
 *      @napi-rs/canvas polyfills win).
 */

type GlobalShape = Record<string, unknown>;

const TARGETS = ['DOMMatrix', 'Path2D', 'ImageData'] as const;

describe('installCanvasStubs — module-load side-effect (Vercel runtime fix)', () => {
  const originals = new Map<string, unknown>();

  beforeEach(() => {
    const g = globalThis as GlobalShape;
    for (const name of TARGETS) {
      originals.set(name, g[name]);
      delete g[name];
    }
    // Reset the module registry so the side-effect re-runs on each
    // import. Without this the first test would install the stubs
    // and the rest would see the cached module without the side
    // effect re-firing.
    vi.resetModules();
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

  it('installs DOMMatrix / Path2D / ImageData on globalThis at module-load time (side-effect import)', async () => {
    // No named import — just the side-effect import. If the install
    // is at module top-level, the bindings must be installed by the
    // time `await import(...)` resolves.
    await import('../installCanvasStubs');
    const g = globalThis as GlobalShape;
    expect(typeof g.DOMMatrix).toBe('function');
    expect(typeof g.Path2D).toBe('function');
    expect(typeof g.ImageData).toBe('function');
  });

  it('exports installCanvasStubs() as an idempotent re-install entry point', async () => {
    const { installCanvasStubs } = await import('../installCanvasStubs');
    // The module-load install already ran above; a second explicit
    // call must NOT throw and must NOT clobber.
    const g = globalThis as GlobalShape;
    const firstDOMMatrix = g.DOMMatrix;
    const result = installCanvasStubs();
    expect(g.DOMMatrix).toBe(firstDOMMatrix);
    // After two installs everything is already set, so a third call
    // reports all targets pre-existing.
    expect(installCanvasStubs().installed).toEqual([]);
    expect(installCanvasStubs().preExisting).toEqual(['DOMMatrix', 'Path2D', 'ImageData']);
    // First call (from this `it`) ran against the pristine state set
    // up by beforeEach — module load already filled everything in, so
    // the function-call install also reports everything pre-existing.
    expect(result.installed).toEqual([]);
  });

  it('canvasGlobalsState() reports the live typeof each target', async () => {
    const { canvasGlobalsState } = await import('../installCanvasStubs');
    const state = canvasGlobalsState();
    expect(state.DOMMatrix).toBe('function');
    expect(state.Path2D).toBe('function');
    expect(state.ImageData).toBe('function');
  });

  it('stub constructors accept the argument shapes pdfjs-dist module init calls them with', async () => {
    await import('../installCanvasStubs');
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

  it('does not clobber a pre-existing DOMMatrix (real canvas wins on local / future installs)', async () => {
    const g = globalThis as GlobalShape;
    class FakeRealDOMMatrix {
      tag = 'real';
    }
    g.DOMMatrix = FakeRealDOMMatrix;
    await import('../installCanvasStubs');
    expect(g.DOMMatrix).toBe(FakeRealDOMMatrix);
  });

  it('parseLinkedInPdf re-imports the stub module — globals must be set even if the parse throws', async () => {
    const { parseLinkedInPdf } = await import('../parseLinkedInPdf');
    await parseLinkedInPdf(new Uint8Array([0, 1, 2, 3])).catch(() => undefined);
    const g = globalThis as GlobalShape;
    expect(typeof g.DOMMatrix).toBe('function');
    expect(typeof g.Path2D).toBe('function');
    expect(typeof g.ImageData).toBe('function');
  });
});
