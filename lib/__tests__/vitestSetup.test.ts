import { describe, expect, it } from 'vitest';

// Guards the global fail-closed fetch stub from vitest.setup.ts.
describe('vitest setup', () => {
  it('stubs fetch to reject unless a test overrides it', async () => {
    await expect(fetch('https://example.invalid/')).rejects.toThrow(
      'unmocked fetch: https://example.invalid/',
    );
  });
});
