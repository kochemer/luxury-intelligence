/**
 * One structured-output call to Claude, priced and capped through Budget.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Budget, claudePrice } from './budget';

export const MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local (it is not in the repo or the shell).');
  }
  return (client ??= new Anthropic());
}

/** Rough upper bound: ~3 characters per token is pessimistic for English. */
const estimateTokens = (s: string) => Math.ceil(s.length / 3);

export async function callJson<T>(opts: {
  budget: Budget;
  step: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
}): Promise<T> {
  const price = claudePrice(MODEL);
  const worstCase =
    (estimateTokens(opts.system + opts.user + JSON.stringify(opts.schema)) * price.in +
      opts.maxTokens * price.out) / 1e6;

  return opts.budget.spend(opts.step, MODEL, worstCase, async () => {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens,
      // If a safety classifier declines, re-run on Anthropic's recommended
      // fallback instead of failing the week. Priced pessimistically below.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: opts.effort,
        format: { type: 'json_schema', schema: opts.schema },
      },
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    });
    const msg = await stream.finalMessage();

    const p = claudePrice(msg.model);
    const u = msg.usage;
    const inTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    const actualUsd = (inTokens * p.in + u.output_tokens * p.out) / 1e6;
    const detail = { servedBy: msg.model, stop: msg.stop_reason, inTokens, outTokens: u.output_tokens };

    if (msg.stop_reason === 'refusal') {
      throw new Error(`${opts.step}: refused (${JSON.stringify(msg.stop_details)})`);
    }
    if (msg.stop_reason === 'max_tokens') {
      throw new Error(`${opts.step}: hit max_tokens (${opts.maxTokens}) before finishing the JSON`);
    }
    const text = msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    return { result: JSON.parse(text) as T, actualUsd, detail };
  });
}
