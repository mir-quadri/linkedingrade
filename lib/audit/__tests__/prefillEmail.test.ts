import { describe, expect, it } from 'vitest';

import { prefillEmail } from '../prefillEmail';

describe('prefillEmail', () => {
  it('returns a trimmed plausible address', () => {
    expect(prefillEmail('  ada@example.com ')).toBe('ada@example.com');
  });

  it.each([undefined, null, '', '   ', 'not-an-email', 'a@b', 'two words@example.com', 'a@@b.com'])(
    'returns empty for %j',
    (input) => {
      expect(prefillEmail(input as string | null | undefined)).toBe('');
    },
  );

  it('rejects absurdly long input', () => {
    expect(prefillEmail(`${'a'.repeat(250)}@example.com`)).toBe('');
  });
});
