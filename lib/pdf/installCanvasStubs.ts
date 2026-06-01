/**
 * Module-load side-effect: install minimal no-op stubs for the canvas
 * globals pdfjs-dist tries to polyfill from `@napi-rs/canvas`.
 *
 * Why this lives in its own module:
 *
 *   The earlier in-function `ensurePdfjsCanvasGlobals()` worked when run
 *   locally with `node_modules/@napi-rs/canvas` removed, but the Vercel
 *   preview kept emitting the same warning and returning 422. The most
 *   likely failure mode is import-order: anything that triggers
 *   `pdf-parse` / `pdfjs-dist` module init BEFORE the in-function
 *   install runs hits a module-level `new DOMMatrix()` against an
 *   undefined global, and Node caches the failed module load for the
 *   lifetime of the lambda.
 *
 *   Putting the stubs at module top-level — and importing this module
 *   as a side-effect import wherever the audit pipeline is reachable —
 *   guarantees they're in place by the time any other module tries to
 *   evaluate. The bare `import './installCanvasStubs'` form is
 *   side-effectful, so bundlers cannot tree-shake it; the named export
 *   below gives belt-and-suspenders callers a function they can also
 *   invoke explicitly inside hot paths.
 *
 * Safe because: we only extract TEXT via pdf-parse; the rendering
 * paths that actually exercise matrix / path / image-data math are
 * never invoked. A locally-loaded real implementation (from
 * @napi-rs/canvas's polyfill code) wins because the install is gated
 * on `typeof X === 'undefined'`.
 */

type GlobalShape = Record<string, unknown>;

function installNow(): { installed: string[]; preExisting: string[] } {
  const g = globalThis as GlobalShape;
  const installed: string[] = [];
  const preExisting: string[] = [];

  if (typeof g.DOMMatrix === 'undefined') {
    class StubDOMMatrix {
      constructor(_input?: unknown) {}
    }
    g.DOMMatrix = StubDOMMatrix;
    installed.push('DOMMatrix');
  } else {
    preExisting.push('DOMMatrix');
  }

  if (typeof g.Path2D === 'undefined') {
    class StubPath2D {
      constructor(_input?: unknown) {}
    }
    g.Path2D = StubPath2D;
    installed.push('Path2D');
  } else {
    preExisting.push('Path2D');
  }

  if (typeof g.ImageData === 'undefined') {
    class StubImageData {
      constructor(_w?: unknown, _h?: unknown) {}
    }
    g.ImageData = StubImageData;
    installed.push('ImageData');
  } else {
    preExisting.push('ImageData');
  }

  return { installed, preExisting };
}

// Top-level side-effect: install on module load. Anyone importing this
// module — whether as `import './installCanvasStubs'` or via the named
// export — guarantees the stubs are in place by the time their own
// module body finishes evaluating.
const initialInstall = installNow();
console.log(
  `[parseLinkedInPdf] canvas-stubs module-load install — installed=[${initialInstall.installed.join(',')}] preExisting=[${initialInstall.preExisting.join(',')}]`,
);

/**
 * Idempotent re-install. Safe to call from inside the audit handler
 * as a belt-and-suspenders defence against module init order quirks
 * on the serverless runtime. Returns the same shape as the module-load
 * install so callers can log the resulting state.
 */
export function installCanvasStubs(): { installed: string[]; preExisting: string[] } {
  return installNow();
}

/**
 * Inspection helper for diagnostic logging — returns the typeof each
 * target global without mutating anything. Used by parseLinkedInPdf
 * to print "before / after" lines in Vercel runtime logs so we can
 * confirm the install ran and that pdf-parse loads against a defined
 * DOMMatrix.
 */
export function canvasGlobalsState(): {
  DOMMatrix: string;
  Path2D: string;
  ImageData: string;
} {
  const g = globalThis as GlobalShape;
  return {
    DOMMatrix: typeof g.DOMMatrix,
    Path2D: typeof g.Path2D,
    ImageData: typeof g.ImageData,
  };
}
