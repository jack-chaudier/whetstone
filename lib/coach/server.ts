import Anthropic from '@anthropic-ai/sdk';
import { coachModel } from '@/lib/coach/models';
import type { ApiCoachProvider } from '@/lib/types';

const REQUEST_TIMEOUT_MS = 20_000;

interface MessageOptions {
  maxTokens?: number;
  system: string;
}

class ProviderRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Provider returned HTTP ${status}`);
  }
}

export function providerHttpStatus(error: unknown): number | undefined {
  return isRecord(error) && typeof error.status === 'number' ? error.status : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: string): string {
  const text = value.trim();
  if (!text) throw new Error('Provider returned no text');
  return text;
}

/** Calls the same exact model path used by the coach. This module is server-only. */
export async function messageText(
  provider: ApiCoachProvider,
  prompt: string,
  apiKey: string,
  { maxTokens = 300, system }: MessageOptions,
): Promise<string> {
  const entry = coachModel(provider);

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.messages.create({
      model: entry.model,
      max_tokens: maxTokens,
      system,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
    });
    return nonEmptyText(response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    );
  }

  const response = await fetch(
    provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://api.x.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: entry.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        reasoning_effort: 'low',
        ...(provider === 'openai'
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) throw new ProviderRequestError(response.status);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error('Provider returned an invalid response');
  }
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') {
    throw new Error('Provider returned an invalid response');
  }
  return nonEmptyText(first.message.content);
}

export type ConnectionStatus =
  | 'missing'
  | 'connected'
  | 'invalid_credentials'
  | 'model_unavailable'
  | 'rate_limited'
  | 'timeout'
  | 'provider_error';

export function connectionFailure(error: unknown): Exclude<ConnectionStatus, 'missing' | 'connected'> {
  const status = providerHttpStatus(error);
  if (status === 401 || status === 403) return 'invalid_credentials';
  if (status === 404) return 'model_unavailable';
  if (status === 429) return 'rate_limited';
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return 'timeout';
  return 'provider_error';
}

export async function probeConnection(provider: ApiCoachProvider, apiKey: string): Promise<void> {
  await messageText(provider, 'Reply with OK only.', apiKey, {
    // Grok reasoning tokens share this budget and cannot be disabled.
    maxTokens: provider === 'xai' || provider === 'xai-oauth' ? 300 : 64,
    system: 'This is a connection check. Reply with the word OK and nothing else.',
  });
}
