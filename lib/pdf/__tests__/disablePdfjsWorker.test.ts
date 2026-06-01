import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Codex Vercel-runtime regression #2: after the canvas-stubs fix,
 * /api/audit's failure shifted from a DOMMatrix ReferenceError to a
 * pdfjs-dist worker error:
 *
 *   "Setting up fake worker failed: 'Cannot find module
 *    \"/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs\"
 *    imported from /var/task/node_modules/pdfjs-dist/legacy/build/pdf.mjs'"
 *
 * pdfjs-dist's fake-worker setup (pdf.mjs ≈ line 21357) checks
 * `globalThis.pdfjsWorker?.WorkerMessageHandler` and uses it
 * directly if present. We pre-populate that global via a static
 * import of the worker module — Vercel's output-file-tracer DOES
 * follow static imports, so the worker file lands in the deploy AND
 * pdfjs-dist's runtime dynamic import is bypassed.
 *
 * These tests pin both halves of the contract: the module-load side
 * effect installs the global, and the exported helpers report a
 * usable `WorkerMessageHandler`.
 */

type GlobalShape = Record<string, unknown>;

describe('disablePdfjsWorker — module-load side-effect (Vercel runtime fix)', () => {
  let originalPdfjsWorker: unknown;

  beforeEach(() => {
    const g = globalThis as GlobalShape;
    originalPdfjsWorker = g.pdfjsWorker;
    delete g.pdfjsWorker;
    // Reset the module registry so the side-effect re-runs on each
    // import. Without this the first test installs and the rest see
    // the cached module without re-firing the side effect.
    vi.resetModules();
  });
  afterEach(() => {
    const g = globalThis as GlobalShape;
    if (originalPdfjsWorker === undefined) {
      delete g.pdfjsWorker;
    } else {
      g.pdfjsWorker = originalPdfjsWorker;
    }
  });

  it('installs globalThis.pdfjsWorker on module load with a valid WorkerMessageHandler', async () => {
    await import('../disablePdfjsWorker');
    const g = globalThis as GlobalShape;
    expect(g.pdfjsWorker).toBeDefined();
    const handler = (g.pdfjsWorker as { WorkerMessageHandler?: unknown }).WorkerMessageHandler;
    expect(typeof handler).toBe('function');
  });

  it('pdfjsWorkerState() reports the live shape on globalThis', async () => {
    const { pdfjsWorkerState } = await import('../disablePdfjsWorker');
    const state = pdfjsWorkerState();
    expect(state.pdfjsWorker).toBe('object');
    expect(state.hasWorkerMessageHandler).toBe(true);
  });

  it('ensurePdfjsWorkerHandler() is idempotent — a second call reports preExisting', async () => {
    const { ensurePdfjsWorkerHandler } = await import('../disablePdfjsWorker');
    // Module-load already installed. A first explicit call should
    // observe the pre-existing handler and NOT re-install.
    const result = ensurePdfjsWorkerHandler();
    expect(result.preExisting).toBe(true);
    expect(result.installed).toBe(false);
  });

  it('does not clobber a pre-existing globalThis.pdfjsWorker with a real WorkerMessageHandler', async () => {
    const g = globalThis as GlobalShape;
    class FakeRealHandler {
      tag = 'real';
    }
    const fakeReal = { WorkerMessageHandler: FakeRealHandler };
    g.pdfjsWorker = fakeReal;
    await import('../disablePdfjsWorker');
    expect(g.pdfjsWorker).toBe(fakeReal);
  });
});
