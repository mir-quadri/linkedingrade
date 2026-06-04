import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { callJudge, type MessagesCreate } from '../callJudge';
import { JUDGE_MODEL } from '../config';
import type { JudgeRequest } from '../types';

const REQUEST: JudgeRequest = {
  auditId: 'audit-1',
  questions: [
    { id: 'q1', sectionId: 'headline', question: 'Is it specific?', context: 'CFO at Acme' },
    { id: 'q2', sectionId: 'about', question: 'Is it concrete?', context: 'I help companies.' },
  ],
};

function fakeMessage(text: string, usage?: Partial<Anthropic.Usage>): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: JUDGE_MODEL,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      ...usage,
    },
  } as unknown as Anthropic.Message;
}

const VALID_BODY = JSON.stringify({
  answers: [
    { id: 'q1', verdict: 'pass', rationale: 'Specific role + company.', confidence: 0.9 },
    { id: 'q2', verdict: 'fail', rationale: 'Too vague.', confidence: 0.8 },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('callJudge', () => {
  it('returns a typed JudgeResponse on success', async () => {
    const messages: MessagesCreate = vi.fn().mockResolvedValue(fakeMessage(VALID_BODY));
    const res = await callJudge(REQUEST, { messages });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected success');
    expect(res.answers).toEqual([
      { id: 'q1', verdict: 'pass', rationale: 'Specific role + company.', confidence: 0.9 },
      { id: 'q2', verdict: 'fail', rationale: 'Too vague.', confidence: 0.8 },
    ]);
    expect(res.usage.model).toBe(JUDGE_MODEL);
    expect(res.usage.inputTokens).toBe(100);
    expect(res.usage.outputTokens).toBe(50);
  });

  it('makes exactly ONE Claude call per request (no per-section fan-out)', async () => {
    const messages = vi.fn().mockResolvedValue(fakeMessage(VALID_BODY));
    await callJudge(REQUEST, { messages });
    expect(messages).toHaveBeenCalledTimes(1);

    // ...regardless of how many questions are batched.
    const many: JudgeRequest = {
      questions: Array.from({ length: 10 }, (_, i) => ({
        id: `q${i}`,
        sectionId: 'headline',
        question: 'q?',
        context: 'ctx',
      })),
    };
    const messages2 = vi.fn().mockResolvedValue(fakeMessage(JSON.stringify({ answers: [] })));
    await callJudge(many, { messages: messages2 });
    expect(messages2).toHaveBeenCalledTimes(1);
  });

  it('sends one batched call to Sonnet with a bounded max_tokens', async () => {
    const messages = vi.fn().mockResolvedValue(fakeMessage(VALID_BODY));
    await callJudge(REQUEST, { messages });
    const params = messages.mock.calls[0][0];
    expect(params.model).toBe(JUDGE_MODEL);
    expect(params.max_tokens).toBeGreaterThan(0);
    expect(params.messages).toHaveLength(1);
  });

  it('logs token usage for $/audit tracking', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const messages = vi.fn().mockResolvedValue(
      fakeMessage(VALID_BODY, { input_tokens: 1_000_000, output_tokens: 0 }),
    );
    const res = await callJudge(REQUEST, { messages });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected success');
    // 1M input tokens @ $3/1M = $3.00 exactly.
    expect(res.usage.costUsd).toBeCloseTo(3.0, 6);
    expect(spy).toHaveBeenCalledWith('[judge] usage', expect.objectContaining({ costUsd: 3 }));
  });

  it('maps an upstream error to { ok: false, reason: upstream_error } without throwing', async () => {
    const messages = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await callJudge(REQUEST, { messages });
    expect(res).toEqual({ ok: false, reason: 'upstream_error', message: 'boom' });
  });

  it('maps a timeout to { ok: false, reason: upstream_timeout }', async () => {
    const messages = vi
      .fn()
      .mockRejectedValue(new Anthropic.APIConnectionTimeoutError({ message: 'timed out' }));
    const res = await callJudge(REQUEST, { messages });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected failure');
    expect(res.reason).toBe('upstream_timeout');
  });

  it('maps a malformed (non-JSON) upstream body to { ok: false, reason: parse_error }', async () => {
    const messages = vi.fn().mockResolvedValue(fakeMessage('not json at all'));
    const res = await callJudge(REQUEST, { messages });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected failure');
    expect(res.reason).toBe('parse_error');
  });

  it('rejects a structurally-wrong body (answers missing) as parse_error', async () => {
    const messages = vi.fn().mockResolvedValue(fakeMessage(JSON.stringify({ nope: true })));
    const res = await callJudge(REQUEST, { messages });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected failure');
    expect(res.reason).toBe('parse_error');
  });
});
