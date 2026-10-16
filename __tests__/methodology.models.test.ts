import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_MODEL_BY_WORKFLOW } from '../lib/llm/models';
import { REALTIME_SPEECH_MODEL } from '../lib/llm/speech';

// /methodology names the models each step uses (owner decision, 2026-10-16).
// When a default model changes, this fails until the page says so too.
test('/methodology names the current default models', () => {
  const page = readFileSync('app/methodology/page.tsx', 'utf8');
  const shown = {
    rank: DEFAULT_MODEL_BY_WORKFLOW.rank,
    summarize: DEFAULT_MODEL_BY_WORKFLOW.summarize,
    polish: DEFAULT_MODEL_BY_WORKFLOW.polish,
    script: DEFAULT_MODEL_BY_WORKFLOW.script,
    classify: DEFAULT_MODEL_BY_WORKFLOW.classify,
    markets: DEFAULT_MODEL_BY_WORKFLOW.markets,
    voice: REALTIME_SPEECH_MODEL,
  };
  for (const [step, model] of Object.entries(shown)) assert.ok(page.includes(model), `${step}: page does not mention ${model}`);
  assert.doesNotMatch(page, /o4-mini|gpt-4\.1|gpt-4o/, 'page names a model the pipeline no longer uses');
});
