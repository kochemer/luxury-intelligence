import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Docs must match the code. Rules: docs/README.md §6.
test('docs:check passes', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'checkDocs.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
