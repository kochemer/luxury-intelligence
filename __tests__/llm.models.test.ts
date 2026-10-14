import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReasoningOrV5, maxTokensParam, temperatureParam, reasoningParam, getReasoningFor, parseReasoningEffort, REASONING_HEADROOM_TOKENS, DEFAULT_MODEL_BY_WORKFLOW } from '../lib/llm/models';

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

// reasoning_effort (added 2026-10-14 for the 2027-01 GPT-4.1/4o retirement):
// opt-in per workflow, sent only to models that accept it, typos fail loudly.

test('reasoning effort is sent only when configured and only to GPT-5/6 and o-series models', () => {
  assert.deepEqual(reasoningParam('gpt-6-luna', 'none'), { reasoning_effort: 'none' });
  assert.deepEqual(reasoningParam('gpt-6.1-sol', 'low'), { reasoning_effort: 'low' });
  assert.deepEqual(reasoningParam('gpt-6-luna', undefined), {});
  // a fallback to a classic model must not carry the param (it would 400)
  assert.deepEqual(reasoningParam('gpt-4.1-mini', 'none'), {});
});

test('reasoning effort comes from LLM_REASONING_<WORKFLOW> and rejects typos', () => {
  const saved = process.env.LLM_REASONING_CLASSIFY;
  try {
    delete process.env.LLM_REASONING_CLASSIFY;
    assert.equal(getReasoningFor('classify'), 'none'); // code default (Luna, 2026-10-14)
    process.env.LLM_REASONING_CLASSIFY = ' Low ';
    assert.equal(getReasoningFor('classify'), 'low');
    process.env.LLM_REASONING_CLASSIFY = 'nope';
    assert.throws(() => getReasoningFor('classify'), /LLM_REASONING_CLASSIFY/);
  } finally {
    if (saved === undefined) delete process.env.LLM_REASONING_CLASSIFY;
    else process.env.LLM_REASONING_CLASSIFY = saved;
  }
  assert.equal(parseReasoningEffort('', 'X'), undefined);
});

// GPT-4.1 / 4.1-mini are removed on 2027-01-14 (docs/pipeline-decisions.md).
test('no workflow defaults to a model OpenAI is retiring', () => {
  const retiring = /^(gpt-4o|gpt-4\.1)/;
  for (const [workflow, model] of Object.entries(DEFAULT_MODEL_BY_WORKFLOW)) {
    assert.doesNotMatch(model, retiring, workflow);
  }
});
