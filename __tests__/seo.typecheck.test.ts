/**
 * The SEO system must type-check, including its entry points in scripts/.
 *
 * The root tsconfig excludes scripts/, so `npx tsc --noEmit` — and the repair
 * system's type gate, which runs exactly that — never looked at them. A string
 * broken across two lines in scripts/runSeoWeekly.ts passed it cleanly and
 * would only have surfaced as the Sunday job crashing.
 *
 * tsx runs scripts without type-checking, so nothing else catches this before
 * CI does. Running it here puts it behind `npm test`, which the repair gates
 * also run.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'child_process';
import path from 'path';

test('the SEO system, scripts included, type-checks', () => {
  // The tsc entry point run with node directly: no shell, so it behaves the
  // same on Windows as in CI.
  const tsc = path.join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.seo.json'], {
    encoding: 'utf-8',
    timeout: 120_000,
  });

  assert.equal(result.status, 0, `tsc -p tsconfig.seo.json failed:\n${result.stdout}${result.stderr}`);
});
