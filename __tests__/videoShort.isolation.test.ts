/**
 * The weekly short video (video-short/) must never reach a Vercel deployment:
 * its renders are ~8-10 MB each, and deployment storage already blew past its
 * limit once (Sept 2026). These checks fail if a guard is removed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ignored = (p: string) => {
  try { execFileSync('git', ['check-ignore', '-q', p]); return true; } catch { return false; }
};

test('video-short renders and deps are gitignored', () => {
  for (const p of [
    'data/weeks/2026-W39/video-short/luxury-intel-60s-2026-W39.mp4',
    'data/weeks/2026-W39/video-short/voice.wav',
    'video-short/node_modules/playwright-core/package.json',
    'video-short/stray.mp4',
  ]) assert.ok(ignored(p), `${p} must be gitignored`);
});

test('video-short source stays committable (it is small)', () => {
  assert.ok(!ignored('video-short/src/run.ts'));
  assert.ok(!ignored('video-short/template/index.html'));
});

test('the app build never type-checks or traces video-short', () => {
  const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  assert.ok(tsconfig.exclude.includes('video-short'), 'tsconfig must exclude video-short (its deps are not in root node_modules)');
  const nextConfig = readFileSync('next.config.ts', 'utf8');
  assert.match(nextConfig, /'\.\/video-short\/\*\*'/);
  assert.match(nextConfig, /'\.\/data\/weeks\/\*\*\/video-short\/\*\*'/);
});

test('no tracked file under video-short is media or over 200 KB', () => {
  const files = execFileSync('git', ['ls-files', '-s', 'video-short'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  for (const line of files) {
    const p = line.split('\t')[1];
    assert.doesNotMatch(p, /\.(mp4|mp3|wav|png|jpg)$/i, `${p} is media`);
    const size = Number(execFileSync('git', ['cat-file', '-s', line.split(/\s+/)[1]], { encoding: 'utf8' }));
    assert.ok(size < 200_000, `${p} is ${size} bytes`);
  }
});
