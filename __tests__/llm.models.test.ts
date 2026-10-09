import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReasoningOrV5, maxTokensParam, temperatureParam, REASONING_HEADROOM_TOKENS } from '../lib/llm/models';

// GPT-5/6 models reject `max_tokens` and any temperature other than 1 with a
// 400. Until 2026-10-09 only the o-series was recognised, so routing a step to
// a GPT-6 model failed every call. These pin the classification.

test('o-series and GPT-5 onwards use the new parameter conventions', () => {
  for (const m of ['o3', 'o4-mini', 'gpt-5', 'gpt-5-mini', 'gpt-5.4-nano', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-10']) {
    assert.equal(isReasoningOrV5(m), true, m);
  }
});

test('GPT-4.x and non-chat models keep the classic parameters', () => {
  for (const m of ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini-tts', 'gpt-image-2']) {
    assert.equal(isReasoningOrV5(m), false, m);
  }
});

test('reasoning models get max_completion_tokens with headroom and no temperature', () => {
  assert.deepEqual(maxTokensParam('gpt-6.1-sol', 100), { max_completion_tokens: 100 + REASONING_HEADROOM_TOKENS });
  assert.deepEqual(temperatureParam('gpt-6.1-sol', 0.4), {});
});

test('classic models get max_tokens and the requested temperature, unchanged', () => {
  assert.deepEqual(maxTokensParam('gpt-4.1', 100), { max_tokens: 100 });
  assert.deepEqual(temperatureParam('gpt-4.1', 0.4), { temperature: 0.4 });
});
