import { describe, expect, it } from 'vitest';

import {
  buildPreflightResponse,
  isOriginAllowed,
  parseAllowedOrigins,
  withCorsHeaders,
} from '../cors';

const ALLOWED = ['chrome-extension://abc', 'https://linkedingrade.com'];

describe('parseAllowedOrigins', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseAllowedOrigins(' a , b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  it('is false for null or unknown origins', () => {
    expect(isOriginAllowed(null, ALLOWED)).toBe(false);
    expect(isOriginAllowed('https://evil.example', ALLOWED)).toBe(false);
  });
  it('is true for an allow-listed origin', () => {
    expect(isOriginAllowed('chrome-extension://abc', ALLOWED)).toBe(true);
  });
});

describe('withCorsHeaders', () => {
  it('echoes the origin when allowed', () => {
    const res = withCorsHeaders(new Response(null), 'chrome-extension://abc', ALLOWED);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('chrome-extension://abc');
    expect(res.headers.get('Vary')).toBe('Origin');
  });
  it('adds no header for a disallowed or absent origin', () => {
    expect(
      withCorsHeaders(new Response(null), 'https://evil.example', ALLOWED).headers.get(
        'Access-Control-Allow-Origin',
      ),
    ).toBeNull();
    expect(
      withCorsHeaders(new Response(null), null, ALLOWED).headers.get('Access-Control-Allow-Origin'),
    ).toBeNull();
  });
});

describe('buildPreflightResponse', () => {
  it('returns 204 with permissive headers for an allowed origin', () => {
    const res = buildPreflightResponse('chrome-extension://abc', ALLOWED, 'Content-Type');
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('chrome-extension://abc');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
  it('omits allow-origin (CORS failure) for an unknown origin but still 204s', () => {
    const res = buildPreflightResponse('https://evil.example', ALLOWED, 'Content-Type');
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
