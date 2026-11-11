import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatCompletion, isFlexRetryable, selectionServiceTier, type TierUsage } from '../selection/serviceTier';

type Call = { body: Record<string, unknown>; opts: unknown };

function fakeClient(responses: Array<unknown>) {
  const calls: Call[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>, opts: unknown) => {
          calls.push({ body, opts });
          const r = responses.shift();
          if (r instanceof Error) throw r;
          return r;
        },
      },
    },
  };
  return { client: client as never, calls };
}

const ok = (cached = 0) => ({
  choices: [{ message: { content: '{}' } }],
  usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: cached } },
});
const httpErr = (status: number, message = 'err') => Object.assign(new Error(message), { status });

test('flex: asks for service_tier flex and records cached tokens', async () => {
  const { client, calls } = fakeClient([ok(80)]);
  const usage: TierUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  await createChatCompletion(client, { model: 'm' }, usage, 'flex');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.service_tier, 'flex');
  assert.deepEqual(
    { calls: usage.calls, p: usage.promptTokens, c: usage.completionTokens, cached: usage.cachedTokens, flex: usage.flexCalls },
    { calls: 1, p: 100, c: 10, cached: 80, flex: 1 },
  );
});

test('flex refused (429) retries once on the standard tier', async () => {
  const { client, calls } = fakeClient([httpErr(429, 'Resource unavailable'), ok()]);
  const usage: TierUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  await createChatCompletion(client, { model: 'm' }, usage, 'flex');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.service_tier, undefined);
  assert.equal(usage.flexFallbacks, 1);
  assert.equal(usage.calls, 1);
});

test('a non-retryable error (401) is thrown, not retried', async () => {
  const { client, calls } = fakeClient([httpErr(401, 'bad key'), ok()]);
  await assert.rejects(createChatCompletion(client, { model: 'm' }, undefined, 'flex'), /bad key/);
  assert.equal(calls.length, 1);
});

test('default tier never sends service_tier', async () => {
  const { client, calls } = fakeClient([ok()]);
  await createChatCompletion(client, { model: 'm' }, undefined, 'default');
  assert.equal(calls[0].body.service_tier, undefined);
});

test('isFlexRetryable: busy, unsupported-tier and timeouts retry; other 400s do not', () => {
  assert.equal(isFlexRetryable(httpErr(503)), true);
  assert.equal(isFlexRetryable(httpErr(400, 'Invalid service_tier for this model')), true);
  assert.equal(isFlexRetryable(httpErr(400, 'max_tokens is not supported')), false);
  assert.equal(isFlexRetryable(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' })), true);
  assert.equal(isFlexRetryable(null), false);
});

test('SELECTION_SERVICE_TIER=default switches flex off; anything else is flex', () => {
  const prev = process.env.SELECTION_SERVICE_TIER;
  try {
    process.env.SELECTION_SERVICE_TIER = 'default';
    assert.equal(selectionServiceTier(), 'default');
    delete process.env.SELECTION_SERVICE_TIER;
    assert.equal(selectionServiceTier(), 'flex');
  } finally {
    if (prev === undefined) delete process.env.SELECTION_SERVICE_TIER; else process.env.SELECTION_SERVICE_TIER = prev;
  }
});
