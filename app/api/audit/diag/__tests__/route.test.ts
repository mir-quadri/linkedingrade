import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

function diagRequest(): Request {
  return new Request('https://example.com/api/audit/diag', { method: 'GET' });
}

describe('GET /api/audit/diag — judge wiring diagnostic', () => {
  beforeEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_PROXY_URL;
    delete process.env.IP_HASH_PEPPER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_REF;
  });
  afterEach(() => {
    delete process.env.JUDGE_PROXY_SECRET;
    delete process.env.JUDGE_PROXY_URL;
    delete process.env.IP_HASH_PEPPER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_REF;
  });

  it('reports judgeKind=NullJudge and secretPresent=false when JUDGE_PROXY_SECRET is unset', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await GET(diagRequest());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.secretPresent).toBe(false);
      expect(body.judgeKind).toBe('NullJudge');
      expect(body.proxyUrl).toBe('https://example.com/api/judge');
      expect(body.proxyUrlOverride).toBe(false);
    } finally {
      warnSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('reports judgeKind=HttpJudge and secretPresent=true when JUDGE_PROXY_SECRET is set', async () => {
    process.env.JUDGE_PROXY_SECRET = 'shhh-do-not-leak';
    process.env.IP_HASH_PEPPER = 'pep';
    process.env.ANTHROPIC_API_KEY = 'sk-do-not-leak';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await GET(diagRequest());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.secretPresent).toBe(true);
      expect(body.pepperSet).toBe(true);
      expect(body.anthropicKeyPresent).toBe(true);
      expect(body.judgeKind).toBe('HttpJudge');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('NEVER leaks secret VALUES — response body contains only booleans + the (non-sensitive) proxy URL + build metadata', async () => {
    process.env.JUDGE_PROXY_SECRET = 'TOPSECRET_PROXY_SECRET_VALUE';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-EXPOSE-IF-LEAKED';
    process.env.IP_HASH_PEPPER = 'TOPSECRET_PEPPER';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await GET(diagRequest());
      const text = await res.text();
      // None of the secret VALUES may appear anywhere in the response.
      expect(text).not.toContain('TOPSECRET_PROXY_SECRET_VALUE');
      expect(text).not.toContain('sk-ant-EXPOSE-IF-LEAKED');
      expect(text).not.toContain('TOPSECRET_PEPPER');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('honours JUDGE_PROXY_URL override and reports it in the proxyUrl field', async () => {
    process.env.JUDGE_PROXY_SECRET = 'shh';
    process.env.JUDGE_PROXY_URL = 'https://judge.example.com/api/judge';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await GET(diagRequest());
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.proxyUrl).toBe('https://judge.example.com/api/judge');
      expect(body.proxyUrlOverride).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('surfaces Vercel build metadata so the response is unambiguous about WHICH deployment answered', async () => {
    process.env.JUDGE_PROXY_SECRET = 'shh';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234';
    process.env.VERCEL_GIT_COMMIT_REF = 'claude/b3-judge-wiring';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const body = (await (await GET(diagRequest())).json()) as Record<string, unknown>;
      expect(body.vercelEnv).toBe('preview');
      expect(body.vercelGitCommitSha).toBe('abc1234');
      expect(body.vercelGitCommitRef).toBe('claude/b3-judge-wiring');
    } finally {
      logSpy.mockRestore();
    }
  });
});
