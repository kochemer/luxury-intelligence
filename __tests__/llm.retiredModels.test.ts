import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// OpenAI removes GPT-4o / 4o-mini / 4.1 / 4.1-mini on 2027-01-14 and the
// speech-endpoint TTS models (tts-1, tts-1-hd, gpt-4o-mini-tts) on 2027-01-06
// (docs/pipeline-decisions.md, "Retirement 2027-01"). No code may name one as
// a model. gpt-4o-mini-tts stays allowed as the voice fallback until its
// cutoff; after that this test fails until the fallbacks are removed.

const ROOTS = ['app', 'digest', 'discovery', 'email', 'lib', 'markets', 'pipeline', 'podcast', 'scripts', 'seo', 'social', 'video', 'video-short'];
const SKIP = new Set(['node_modules', '.next', 'out']);
const RETIRED = /['"`](gpt-4o(?:-mini)?(?:-\d{4}-\d{2}-\d{2})?|gpt-4\.1(?:-mini)?(?:-\d{4}-\d{2}-\d{2})?|tts-1(?:-hd)?|gpt-4o-mini-tts(?:-\d{4}-\d{2}-\d{2})?)['"`]/g;
const TTS_CUTOFF = Date.parse('2027-01-06T00:00:00Z');

function files(dir: string): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return []; }
  return entries.flatMap(name => {
    if (SKIP.has(name)) return [];
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs|js)$/.test(name) ? [p] : [];
  });
}

test('no code names a model OpenAI is retiring in 2027-01', () => {
  const hits: string[] = [];
  for (const file of ROOTS.flatMap(files)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(RETIRED)) {
      const model = m[1];
      if (model === 'gpt-4o-mini-tts' && Date.now() < TTS_CUTOFF) continue; // voice fallback until its cutoff
      hits.push(`${file}: ${model}`);
    }
  }
  assert.deepEqual(hits, [], `retiring models still referenced:\n${hits.join('\n')}`);
});
