import { describe, expect, it } from 'vitest';

import {
  REDACT_MAX_INPUT,
  __EMAIL_IN_TEXT_FOR_TESTS,
  maskEmail,
  redactEmails,
} from '../maskEmail';

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

describe('redactEmails — ReDoS / input cap regression', () => {
  const time = (fn: () => void) => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  };
  const inputs: Array<[string, string]> = [
    ["1e5 x 'a'", 'a'.repeat(100_000)],
    ["5e4 x 'a@' (1e5 chars)", 'a@'.repeat(50_000)],
    ["'a@' + 1e5 x 'a'", `a@${'a'.repeat(100_000)}`],
  ];

  it.each(inputs)('redactEmails(%s) finishes in < 100ms', (_label, input) => {
    expect(time(() => redactEmails(input))).toBeLessThan(100);
  });

  // Independent of the input cap: the bounded regex itself must not be
  // quadratic on the full 1e5-char input (the unbounded version took ~8.7s).
  it.each(inputs)('bounded regex alone on %s stays well under 1s', (_label, input) => {
    expect(time(() => input.replace(__EMAIL_IN_TEXT_FOR_TESTS, 'X'))).toBeLessThan(1000);
  });

  it('still redacts normal emails in short text', () => {
    expect(redactEmails('failed for mir@gmail.com (422)')).toBe('failed for m***@g***.com (422)');
  });

  it('caps long input, still redacting within the kept window', () => {
    const body = `err zebulon@vexillology.org ${'x'.repeat(5000)}`;
    const out = redactEmails(body);
    expect(out).toContain('z***@v***.org');
    expect(out).not.toMatch(/zebulon|vexillology/);
    expect(out).toContain(`…[truncated ${body.length - REDACT_MAX_INPUT} chars]`);
    expect(out.length).toBeLessThan(REDACT_MAX_INPUT + 40);
  });

  it('redacts an address cut off by the cap instead of leaking its local part', () => {
    const pad = 'x '.repeat((REDACT_MAX_INPUT - 20) / 2);
    const body = `${pad}zebulon@vexillology.org trailing text ${'y'.repeat(100)}`;
    const out = redactEmails(body);
    expect(out).not.toMatch(/zebulon|vexillology/);
  });
});

