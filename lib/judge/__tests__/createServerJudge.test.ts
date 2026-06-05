import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServerJudge } from '../createServerJudge';
import { HttpJudge } from '../httpJudge';
import { NullJudge } from '@/lib/engine/types/judge';

describe('createServerJudge — env-driven judge selection', () => {
  beforeEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_PROXY_URL;
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_PROXY_URL;
  });

  it('returns NullJudge when JUDGE_PROXY_SECRET is unset (graceful local-dev fallback)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const judge = createServerJudge({
        origin: 'https://example.com',
        auditId: 'aud_test',
      });
      expect(judge).toBeInstanceOf(NullJudge);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns HttpJudge when JUDGE_PROXY_SECRET is set, defaulting URL to <origin>/api/judge', () => {
    process.env.JUDGE_PROXY_SECRET = 'shh';
    const judge = createServerJudge({
      origin: 'https://example.com',
      auditId: 'aud_test',
    });
    expect(judge).toBeInstanceOf(HttpJudge);
  });

  it('honours JUDGE_PROXY_URL override (split-deploy scenario)', async () => {
    process.env.JUDGE_PROXY_SECRET = 'shh';
    process.env.JUDGE_PROXY_URL = 'https://judge.example.com/api/judge';
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', judgeResponse: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    // We can't easily intercept the fetch inside HttpJudge via this
    // factory, but we can assert the constructed judge calls the
    // overridden URL by spying on fetch.
    const judge = createServerJudge({
      origin: 'https://wrong.example.com',
      auditId: 'aud_test',
    });
    // Inject the spy by temporarily swapping global fetch.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as typeof fetch;
    try {
      await judge.evaluate({ headline: { text: 'X' } });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe('https://judge.example.com/api/judge');
  });
});

describe('createServerJudge — client header forwarding (Codex Round 1 P1)', () => {
  beforeEach(() => {
    process.env.JUDGE_PROXY_SECRET = 'shh';
    delete process.env.JUDGE_PROXY_URL;
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_PROXY_URL;
  });

  it('forwards x-forwarded-for and x-real-ip from inboundHeaders to the proxy', async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', judgeResponse: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const inbound = new Headers({
      'x-forwarded-for': '203.0.113.42, 10.0.0.1',
      'x-real-ip': '203.0.113.42',
      // None of these must reach the proxy:
      cookie: 'session=secret',
      authorization: 'Bearer user-token',
      'user-agent': 'Mozilla/5.0 (browser)',
    });
    const judge = createServerJudge({
      origin: 'https://example.com',
      auditId: 'aud_test',
      inboundHeaders: inbound,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as typeof fetch;
    try {
      await judge.evaluate({ headline: { text: 'X' } });
    } finally {
      globalThis.fetch = originalFetch;
    }
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-forwarded-for']).toBe('203.0.113.42, 10.0.0.1');
    expect(headers['x-real-ip']).toBe('203.0.113.42');
    // Sensitive headers must NOT leak through the server-to-server call.
    expect(headers['cookie']).toBeUndefined();
    expect(headers['Cookie']).toBeUndefined();
    expect(headers['authorization']).toBeUndefined();
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['user-agent']).toBeUndefined();
  });

  it('no x-forwarded-for / x-real-ip on the inbound request → no IP headers on the inner call (proxy falls back to its own no-IP handling)', async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', judgeResponse: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const inbound = new Headers({ 'content-type': 'multipart/form-data' });
    const judge = createServerJudge({
      origin: 'https://example.com',
      auditId: 'aud_test',
      inboundHeaders: inbound,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as typeof fetch;
    try {
      await judge.evaluate({ headline: { text: 'X' } });
    } finally {
      globalThis.fetch = originalFetch;
    }
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-forwarded-for']).toBeUndefined();
    expect(headers['x-real-ip']).toBeUndefined();
  });
});
