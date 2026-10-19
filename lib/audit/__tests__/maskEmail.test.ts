import { describe, expect, it } from 'vitest';

import { maskEmail } from '../maskEmail';

describe('maskEmail', () => {
  it('masks a typical address to first chars + TLD', () => {
    expect(maskEmail('mir@gmail.com')).toBe('m***@g***.com');
  });

  it('trims surrounding whitespace', () => {
    expect(maskEmail('  mir@gmail.com ')).toBe('m***@g***.com');
  });

  it('reveals nothing of a 1-character local part', () => {
    expect(maskEmail('a@b.io')).toBe('***@b***.io');
  });

  it('collapses subdomains and multi-part suffixes', () => {
    expect(maskEmail('jane.doe@mail.corp.example.co.uk')).toBe('j***@m***.uk');
    expect(maskEmail('x+tag@sub.domain.org')).toBe('x***@s***.org');
  });

  it('never contains the raw local part or domain', () => {
    const raw = 'johnathan.smith@acmecorp.com';
    const masked = maskEmail(raw)!;
    expect(masked).not.toContain('johnathan');
    expect(masked).not.toContain('acmecorp');
    expect(masked).not.toContain(raw);
  });

  it.each([
    undefined,
    null,
    '',
    '   ',
    'not-an-email',
    '@gmail.com',
    'mir@',
    'mir@gmail',
    'mir@@gmail.com',
    'a@b@c.com',
    'mir@gmail..com',
    'mir@.com',
    'mir@gmail.',
    'mir @gmail.com',
    'mir@gmail.c0m',
    `${'a'.repeat(250)}@x.com`,
  ])('returns null for malformed %j', (input) => {
    expect(maskEmail(input as string | null | undefined)).toBeNull();
  });
});
