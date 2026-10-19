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
  const originalKey = process.env.KIT_API_KEY;
  const originalForm = process.env.KIT_FORM_ID;
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  let logs: string[] = [];
  let consoleSpies: Array<{ mockRestore: () => void }> = [];

  beforeEach(() => {
    process.env.KIT_API_KEY = 'kit_test';
    process.env.KIT_FORM_ID = '123';
    fetchSpy.mockReset();
    logs = [];
    consoleSpies = (['log', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      }),
    );
  });
  afterEach(() => {
    process.env.KIT_API_KEY = originalKey;
    process.env.KIT_FORM_ID = originalForm;
    // Restore only the console spies: the fetch spy must stay installed so
    // no test can fall through to the real Kit API.
    for (const spy of consoleSpies) spy.mockRestore();
  });

  it('never reaches the network unmocked', () => {
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
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
