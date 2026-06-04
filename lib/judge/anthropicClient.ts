/**
 * Minimal Anthropic Messages-API client for the judge proxy. Direct
 * fetch — no SDK — so the proxy bundle stays small and easy to audit.
 *
 * Cost controls are baked in:
 *   - `maxOutputTokens` hard cap on every call (default 1500, ~$0.012
 *     per call at sonnet pricing).
 *   - 12 s request timeout via AbortController; on timeout the caller
 *     sees a thrown error and falls through to "judge unavailable".
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
  /** Hard request timeout — defaults to 12_000ms. Resend's pattern. */
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

const DEFAULT_TIMEOUT_MS = 12_000;

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
      const body = await resp.text().catch(() => '');
      throw new Error(
        `anthropic ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
    const json = (await resp.json()) as AnthropicResponseBody;
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
