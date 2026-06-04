import Anthropic from '@anthropic-ai/sdk';

import {
  JUDGE_MODEL,
  MAX_TOKENS,
  PRICING_PER_MTOK,
  UPSTREAM_TIMEOUT_MS,
} from './config';
import type { JudgeAnswer, JudgeRequest, JudgeResponse, JudgeUsage } from './types';

/**
 * The single Claude call behind the judge proxy. Builds ONE batched request
 * for all questions (no per-section fan-out), forwards it to Sonnet with a
 * tight system prompt and a structured-output schema, and maps every outcome —
 * success, upstream error, timeout, unparseable body — onto the typed
 * `JudgeResponse`. It never throws: callers get `{ ok: false, reason }` for
 * anything that goes wrong, which the engine absorbs as `needsReview`.
 */

/** Injectable seam for tests — the real impl wraps `client.messages.create`. */
export type MessagesCreate = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: { timeout?: number },
) => Promise<Anthropic.Message>;

export interface JudgeDeps {
  messages?: MessagesCreate;
}

const SYSTEM_PROMPT =
  'You are a strict LinkedIn profile auditor. You receive a JSON array of ' +
  'questions; each has an id, the profile section it concerns, the question, ' +
  'and the relevant profile text as context. Assess each question ' +
  'independently against its own context only — never invent facts not present ' +
  'in the context. For each question return a verdict ("pass" = clearly meets ' +
  'the bar, "partial" = partially meets it, "fail" = does not), a one-sentence ' +
  'rationale, and a confidence from 0 to 1. Echo each question id exactly. ' +
  'Respond with the required JSON object only.';

/** Structured-output schema — guarantees a parseable answers array. */
const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['pass', 'partial', 'fail'] },
          rationale: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['id', 'verdict', 'rationale', 'confidence'],
      },
    },
  },
  required: ['answers'],
};

const VERDICTS = new Set<JudgeAnswer['verdict']>(['pass', 'partial', 'fail']);

function defaultMessagesCreate(): MessagesCreate {
  // The route guarantees ANTHROPIC_API_KEY is present before we get here; the
  // SDK reads it from the environment. maxRetries keeps a transient blip from
  // turning into an immediate hard failure without unbounded latency.
  const client = new Anthropic({ maxRetries: 1 });
  return (params, options) =>
    client.messages.create(params, options) as Promise<Anthropic.Message>;
}

function extractText(message: Anthropic.Message): string | null {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text.length > 0 ? text : null;
}

function computeCost(usage: Anthropic.Usage): number {
  const perToken = (perMtok: number) => perMtok / 1_000_000;
  return (
    (usage.input_tokens ?? 0) * perToken(PRICING_PER_MTOK.input) +
    (usage.output_tokens ?? 0) * perToken(PRICING_PER_MTOK.output) +
    (usage.cache_read_input_tokens ?? 0) * perToken(PRICING_PER_MTOK.cacheRead) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(PRICING_PER_MTOK.cacheWrite)
  );
}

/** Coerce the model's JSON into validated `JudgeAnswer[]`, or null if unusable. */
function parseAnswers(raw: string): JudgeAnswer[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const list = (parsed as { answers?: unknown }).answers;
  if (!Array.isArray(list)) return null;

  const answers: JudgeAnswer[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null;
    const { id, verdict, rationale, confidence } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id) return null;
    if (typeof verdict !== 'string' || !VERDICTS.has(verdict as JudgeAnswer['verdict'])) {
      return null;
    }
    const conf = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0;
    answers.push({
      id,
      verdict: verdict as JudgeAnswer['verdict'],
      rationale: typeof rationale === 'string' ? rationale : '',
      // Clamp to the documented 0–1 range.
      confidence: Math.min(1, Math.max(0, conf)),
    });
  }
  return answers;
}

export async function callJudge(req: JudgeRequest, deps: JudgeDeps = {}): Promise<JudgeResponse> {
  const messages = deps.messages ?? defaultMessagesCreate();

  let message: Anthropic.Message;
  try {
    message = await messages(
      {
        model: JUDGE_MODEL,
        max_tokens: MAX_TOKENS,
        // Cost-first defaults for a proxy. Unit 2 owns quality tuning and may
        // raise effort or enable thinking.
        thinking: { type: 'disabled' },
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            // Stable prefix — cache it. (No-op below Sonnet's min cacheable
            // prefix, but harmless and correct if the prompt grows.)
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Questions:\n${JSON.stringify(req.questions)}`,
          },
        ],
      },
      { timeout: UPSTREAM_TIMEOUT_MS },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return { ok: false, reason: 'upstream_timeout', message: 'Judge call timed out.' };
    }
    const detail = err instanceof Error ? err.message : 'Unknown upstream error.';
    return { ok: false, reason: 'upstream_error', message: detail };
  }

  const text = extractText(message);
  if (!text) {
    return { ok: false, reason: 'parse_error', message: 'Empty or non-text judge response.' };
  }
  const answers = parseAnswers(text);
  if (!answers) {
    return { ok: false, reason: 'parse_error', message: 'Judge response was not valid JSON.' };
  }

  const usage: JudgeUsage = {
    model: message.model ?? JUDGE_MODEL,
    inputTokens: message.usage.input_tokens ?? 0,
    outputTokens: message.usage.output_tokens ?? 0,
    cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
    costUsd: computeCost(message.usage),
  };

  // Cost-per-audit log — read real $/audit from these after a few test calls.
  console.info('[judge] usage', {
    auditId: req.auditId ?? null,
    questions: req.questions.length,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    costUsd: Number(usage.costUsd.toFixed(6)),
  });

  return { ok: true, answers, usage };
}
