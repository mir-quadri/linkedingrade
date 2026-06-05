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

describe('createServerJudge — client header forwarding (Codex Round 1 P1 + Round 4 P2 + Round 6 F2)', () => {
  beforeEach(() => {
    process.env.JUDGE_PROXY_SECRET = 'shh';
    // Pepper enables forwarding; tests assume production-like
    // configuration unless they explicitly delete it.
    process.env.IP_HASH_PEPPER = 'pepper';
    delete process.env.JUDGE_PROXY_URL;
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.IP_HASH_PEPPER;
    delete process.env.JUDGE_PROXY_URL;
  });

  async function captureOutboundHeaders(inbound: Headers): Promise<Record<string, string>> {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', judgeResponse: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
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
    return (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
  }

  it('uses Vercel-trusted x-vercel-forwarded-for chain[0] as the source of the real client IP', async () => {
    const headers = await captureOutboundHeaders(
      new Headers({
        // Vercel-set: chain[0] is the verified client IP. Stays
        // verified even if the client also sent an x-forwarded-for.
        'x-vercel-forwarded-for': '203.0.113.42, 10.0.0.1',
        'x-forwarded-for': '198.51.100.0, 203.0.113.42, 10.0.0.1',
        'x-real-ip': '203.0.113.42',
      }),
    );
    // Forwarded via x-real-ip ONLY (the trusted single-value slot).
    expect(headers['x-real-ip']).toBe('203.0.113.42');
    // x-forwarded-for is NEVER forwarded — its chain[0] on Vercel is
    // attacker-controlled and would let a scripted caller fan out
    // across the proxy's per-IP rate-limit buckets.
    expect(headers['x-forwarded-for']).toBeUndefined();
  });

  it('falls back to x-real-ip when x-vercel-forwarded-for is absent (non-Vercel hosts / older runtimes)', async () => {
    const headers = await captureOutboundHeaders(
      new Headers({
        'x-real-ip': '203.0.113.42',
        // No x-vercel-forwarded-for. The inbound also carries an
        // x-forwarded-for but we IGNORE it — even on non-Vercel hosts
        // we'd rather drop to no-IP than partition by an
        // attacker-controlled value.
        'x-forwarded-for': '198.51.100.0',
      }),
    );
    expect(headers['x-real-ip']).toBe('203.0.113.42');
    expect(headers['x-forwarded-for']).toBeUndefined();
  });

  it("does NOT forward x-forwarded-for, even when it's the only IP-y header on the inbound (Codex Round 4 P2)", async () => {
    // This is the threat case Codex flagged: a scripted caller hits
    // /api/audit with x-forwarded-for: <random>. On a non-Vercel host
    // with no x-vercel-forwarded-for and no x-real-ip, we have NO
    // trusted IP source. The previous behaviour was to forward the
    // raw x-forwarded-for — which would let the attacker fan out.
    // The new behaviour: drop to no-IP and let the proxy partition
    // accordingly.
    const headers = await captureOutboundHeaders(
      new Headers({ 'x-forwarded-for': '198.51.100.0' }),
    );
    expect(headers['x-real-ip']).toBeUndefined();
    expect(headers['x-forwarded-for']).toBeUndefined();
  });

  it("does NOT forward sensitive client headers (cookies, auth, user-agent)", async () => {
    const headers = await captureOutboundHeaders(
      new Headers({
        'x-vercel-forwarded-for': '203.0.113.42',
        cookie: 'session=secret',
        authorization: 'Bearer user-token',
        'user-agent': 'Mozilla/5.0 (browser)',
      }),
    );
    expect(headers['x-real-ip']).toBe('203.0.113.42');
    expect(headers['cookie']).toBeUndefined();
    expect(headers['Cookie']).toBeUndefined();
    expect(headers['authorization']).toBeUndefined();
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['user-agent']).toBeUndefined();
  });

  it("no Vercel-trusted IP source on the inbound → no IP headers on the inner call", async () => {
    const headers = await captureOutboundHeaders(
      new Headers({ 'content-type': 'multipart/form-data' }),
    );
    expect(headers['x-forwarded-for']).toBeUndefined();
    expect(headers['x-real-ip']).toBeUndefined();
  });

  it('IP_HASH_PEPPER unset → no IP headers forwarded (Round 6 F2: keep privacy bullet accurate when proxy would use raw IP)', async () => {
    delete process.env.IP_HASH_PEPPER;
    const headers = await captureOutboundHeaders(
      new Headers({
        'x-vercel-forwarded-for': '203.0.113.42',
        'x-real-ip': '203.0.113.42',
      }),
    );
    // Privacy bullet says "the audit pipeline forwards a one-way
    // SHA-256 hash of your IP (peppered with the same server secret)".
    // Without the pepper that hash doesn't exist, so the audit
    // pipeline must NOT forward the raw IP — otherwise the proxy
    // would key its rate limit by raw IP in memory, contradicting
    // the disclosed contract.
    expect(headers['x-real-ip']).toBeUndefined();
    expect(headers['x-forwarded-for']).toBeUndefined();
  });
});
