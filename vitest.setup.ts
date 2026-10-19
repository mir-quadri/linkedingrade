// Global test guard: no test may reach the real network by accident. fetch
// rejects unless a test overrides it (vi.spyOn(globalThis, 'fetch'),
// vi.stubGlobal('fetch', …), or direct assignment). Spies wrap this stub, so
// mockRestore()/unstubAllGlobals() land back here, not on the real fetch.
const unmockedFetch: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  throw new Error(`unmocked fetch: ${url}`);
};
globalThis.fetch = unmockedFetch;
