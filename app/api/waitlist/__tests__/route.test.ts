import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';

const RAW = 'zebulon@vexillology.org';

function req(body: unknown): Request {
  return new Request('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/waitlist logging', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  let logs: string[] = [];
  let consoleSpies: Array<{ mockRestore: () => void }> = [];

  beforeEach(() => {
    vi.stubEnv('KIT_API_KEY', 'kit_test');
    vi.stubEnv('KIT_FORM_ID', '123');
    fetchSpy.mockReset();
    // Fail closed: after the reset, any fetch a test didn't explicitly mock
    // throws instead of reaching the real Kit API.
    fetchSpy.mockImplementation(() => {
      throw new Error('unmocked fetch');
    });
    logs = [];
    consoleSpies = (['log', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      }),
    );
  });
  afterEach(() => {
    // Restores originals exactly (an unset var stays unset, not 'undefined').
    vi.unstubAllEnvs();
    // Restore only the console spies: the fetch spy must stay installed so
    // no test can fall through to the real Kit API.
    for (const spy of consoleSpies) spy.mockRestore();
  });

  it('never reaches the network unmocked', () => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
    expect(() => globalThis.fetch('https://api.kit.com/v4/subscribers')).toThrow('unmocked fetch');
  });

  it('rejects emails longer than 254 chars with the invalid-email 400, without calling Kit', async () => {
    const long = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`; // 255 chars
    expect(long.length).toBe(255);
    const res = await POST(req({ email: long }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That doesn't look like a valid email." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still accepts a 254-char address', async () => {
    const ok = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`;
    expect(ok.length).toBe(254);
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }));
    const res = await POST(req({ email: ok }));
    expect(res.status).toBe(200);
  });

  it('logs a masked address on success', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }));
    const res = await POST(req({ email: RAW }));
    expect(res.status).toBe(200);
    const all = logs.join('\n');
    expect(all).toContain('z***@v***.org');
    expect(all).not.toMatch(/zebulon|vexillology/);
  });

  it('redacts the address when Kit echoes it in an error body', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(`{"errors":["Email address ${RAW} is invalid"]}`, { status: 422 }),
    );
    const res = await POST(req({ email: RAW }));
    expect(res.status).toBe(500);
    const all = logs.join('\n');
    expect(all).toContain('z***@v***.org');
    expect(all).not.toMatch(/zebulon|vexillology/);
  });

  it('redacts on attach-to-form errors too', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response(`dup ${RAW}`, { status: 409 }));
    await POST(req({ email: RAW }));
    expect(logs.join('\n')).not.toMatch(/zebulon|vexillology/);
  });
});
