/**
 * OpenAI service tier for the selection funnel's chat calls (triage, judge, editor).
 *
 * Default `flex`: same model and output, about half the token price, slower and
 * sometimes refused when OpenAI is busy (429/503) or not offered for a model (400).
 * Any of those, or a flex timeout, retries once on the standard tier, so flex can
 * only make a call slower, never fail it. `SELECTION_SERVICE_TIER=default` turns it off.
 * Both gpt-6.1-sol and gpt-6-luna accepted flex in a probe on 2026-11-11.
 *
 * Usage records cached input tokens too: OpenAI bills a repeated prompt prefix
 * (our system prompts, >1024 tokens) at a discount, so promptTokens alone overstates cost.
 */
import type OpenAI from 'openai';
import { OPENAI_REQUEST_OPTIONS } from './types';

export type SelectionServiceTier = 'flex' | 'default';

export function selectionServiceTier(): SelectionServiceTier {
  return (process.env.SELECTION_SERVICE_TIER || 'flex').trim().toLowerCase() === 'default' ? 'default' : 'flex';
}

/** Flex is slower; give it longer, and don't retry on flex (the fallback is the retry). */
export const FLEX_REQUEST_OPTIONS = { timeout: 180_000, maxRetries: 0 } as const;

export interface TierUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  /** prompt tokens billed at the cached-input rate */
  cachedTokens?: number;
  /** calls served on the flex tier */
  flexCalls?: number;
  /** calls where flex was refused or timed out and the standard tier answered */
  flexFallbacks?: number;
}

/** Errors after which the same request is worth retrying on the standard tier. */
export function isFlexRetryable(err: unknown): boolean {
  const e = err as { status?: number; name?: string; message?: string; constructor?: { name?: string } } | null;
  if (!e) return false;
  const status = e.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  const msg = String(e.message ?? '');
  if (status === 400 && /service_tier|flex/i.test(msg)) return true;
  const name = e.name || e.constructor?.name || '';
  return /APIConnectionTimeoutError|APIConnectionError|AbortError/.test(name) || /timed? ?out/i.test(msg);
}

type ChatClient = Pick<OpenAI, 'chat'>;
type ChatBody = Record<string, unknown>;

export async function createChatCompletion(
  client: ChatClient,
  body: ChatBody,
  usage?: TierUsage,
  tier: SelectionServiceTier = selectionServiceTier(),
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let res: OpenAI.Chat.Completions.ChatCompletion | undefined;
  if (tier === 'flex') {
    try {
      res = (await client.chat.completions.create(
        { ...body, service_tier: 'flex' } as never,
        FLEX_REQUEST_OPTIONS,
      )) as OpenAI.Chat.Completions.ChatCompletion;
      if (usage) usage.flexCalls = (usage.flexCalls ?? 0) + 1;
    } catch (err) {
      if (!isFlexRetryable(err)) throw err;
      if (usage) usage.flexFallbacks = (usage.flexFallbacks ?? 0) + 1;
      const e = err as { status?: number; message?: string };
      console.warn(`[Selection] flex tier unavailable (${e.status ?? ''} ${String(e.message ?? err).slice(0, 120)}); retrying on the standard tier`);
    }
  }
  if (!res) {
    res = (await client.chat.completions.create(body as never, OPENAI_REQUEST_OPTIONS)) as OpenAI.Chat.Completions.ChatCompletion;
  }
  if (usage) {
    usage.calls += 1;
    usage.promptTokens += res.usage?.prompt_tokens ?? 0;
    usage.completionTokens += res.usage?.completion_tokens ?? 0;
    usage.cachedTokens = (usage.cachedTokens ?? 0) + (res.usage?.prompt_tokens_details?.cached_tokens ?? 0);
  }
  return res;
}
