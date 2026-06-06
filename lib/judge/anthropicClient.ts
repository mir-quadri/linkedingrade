/**
 * Minimal Anthropic Messages-API client for the judge proxy. Direct
 * fetch — no SDK — so the proxy bundle stays small and easy to audit.
 *
 * Cost controls are baked in:
 *   - `maxOutputTokens` hard cap on every call (default 1500, ~$0.012
 *     per call at sonnet pricing).
 *   - 30 s request timeout via AbortController; on timeout the caller
 *     sees a thrown error and falls through to "judge unavailable".
 *     (Production raised from the original 12 s after real audits with
 *     judgments + 2 rewrites hit the wall — see the merged "fix judge
 *     timeout" change in `app/api/judge`.)
 *   - Returns `usage` so the route can log cost-per-audit.
 */

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicCallParams {
  apiKey: string;
  model: string;
  system: string;
  messages: AnthropicMessage[];
  maxOutputTokens: number;
  /** Hard request timeout — defaults to 30_000ms. Raised from 12s
   * after real-profile audits with rewrites consistently hit the
   * original wall. */
  timeoutMs?: number;
}

export interface AnthropicUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AnthropicResult {
  /** First text block, concatenated. The judge prompt asks for JSON only. */
  text: string;
  usage: AnthropicUsage;
  stopReason: string | null;
}

/**
 * Default Anthropic upstream timeout. Exported so route + test code
 * can refer to the same number rather than duplicating the magic
 * value. Caller-side timeouts (see `httpJudge.ts`) MUST sit above
 * this — see `__tests__/timeoutInvariants.test.ts`.
 */
export const ANTHROPIC_DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = ANTHROPIC_DEFAULT_TIMEOUT_MS;

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicUsageRaw {
  input_tokens?: number;
  output_tokens?: number;
}

interface AnthropicResponseBody {
  content?: AnthropicContentBlock[];
  usage?: AnthropicUsageRaw;
  stop_reason?: string;
}

export async function callAnthropic(params: AnthropicCallParams): Promise<AnthropicResult> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxOutputTokens,
        system: params.system,
        messages: params.messages,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await readTextWithAbort(resp, controller.signal).catch(() => '');
      throw new Error(
        `anthropic ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
    const json = (await readJsonWithAbort(resp, controller.signal)) as AnthropicResponseBody;
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text!)
      .join('');
    return {
      text,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
      stopReason: json.stop_reason ?? null,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Rough cost calculation for the audit-log "cost-per-audit" line.
 * Prices in USD per 1M tokens. These match Sonnet 4.x as of the proxy
 * launch; if the model changes, update via env.
 */
export interface PriceTable {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export const DEFAULT_PRICES: PriceTable = {
  // Conservative defaults — better to over-estimate than under-report.
  // Override via env to keep this honest as Anthropic pricing changes.
  inputUsdPerMillion: 3.0,
  outputUsdPerMillion: 15.0,
};

export function estimateUsd(usage: AnthropicUsage, prices: PriceTable = DEFAULT_PRICES): number {
  const input = (usage.inputTokens / 1_000_000) * prices.inputUsdPerMillion;
  const output = (usage.outputTokens / 1_000_000) * prices.outputUsdPerMillion;
  return Math.round((input + output) * 10_000) / 10_000; // round to 4dp
}

/**
 * Read a `Response` body as JSON, racing against an `AbortSignal`.
 * See the matching helper in `httpJudge.ts` for the production
 * dead-zone bug this guards against (body stream not honouring the
 * fetch-level abort, causing `await resp.json()` to hang past
 * `maxDuration` and skip `catch`/`finally`).
 */
async function readJsonWithAbort(res: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) {
    await res.body?.cancel().catch(() => undefined);
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      res.body?.cancel().catch(() => undefined);
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([res.json(), abortPromise]);
}

/** Same shape as `readJsonWithAbort` but for the error-path text body. */
async function readTextWithAbort(res: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) {
    await res.body?.cancel().catch(() => undefined);
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      res.body?.cancel().catch(() => undefined);
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([res.text(), abortPromise]);
}
