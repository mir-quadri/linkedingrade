import { describe, expect, it } from 'vitest';

import { maskEmail, redactEmails } from '../maskEmail';

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

  it('keeps astral / emoji first characters whole (no lone surrogate)', () => {
    expect(maskEmail('😀smile@𝒳domain.com')).toBe('😀***@𝒳***.com');
    expect(maskEmail('𝒳@example.com')).toBe('***@e***.com');
    const masked = maskEmail('😀smile@😀mail.com')!;
    // A lone surrogate would fail a round-trip through UTF-8.
    expect(new TextDecoder().decode(new TextEncoder().encode(masked))).toBe(masked);
    expect(masked).toBe('😀***@😀***.com');
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

describe('redactEmails', () => {
  it('masks every email-shaped substring in free text', () => {
    const body = '{"errors":["Email address mir@gmail.com is invalid","dup: jane.doe@corp.example.co.uk"]}';
    const out = redactEmails(body);
    expect(out).toContain('m***@g***.com');
    expect(out).toContain('j***@c***.uk');
    expect(out).not.toMatch(/mir@|gmail|jane\.doe|corp\.example/);
  });

  it('uses [email] for shapes it cannot mask', () => {
    expect(redactEmails('to=a@b.c0m')).toBe('to=[email]');
  });

  it('leaves text without emails untouched', () => {
    expect(redactEmails('status=422 body=rate limited')).toBe('status=422 body=rate limited');
  });
});
