/**
 * Discarding a failed repair must remove the agent's work and nothing else.
 *
 * It used to `git reset --hard`, which also wiped data/seo/: the monitor state
 * written earlier in the same CI job (so a defect re-alerted daily) and the
 * spend record (so the 30-day budget undercounted). Run against a throwaway
 * git repo, because the bug only exists in real git behaviour.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { abandon } from '../seo/repair/runRepair';

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

test('a discarded repair keeps data/seo/ and removes everything the agent did', async () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'seo-discard-'));
  const cwd = process.cwd();
  try {
    sh(repo, 'init', '-q', '-b', 'main');
    sh(repo, 'config', 'user.email', 't@example.test');
    sh(repo, 'config', 'user.name', 'test');
    sh(repo, 'config', 'core.autocrlf', 'false');
    mkdirSync(path.join(repo, 'data', 'seo'), { recursive: true });
    mkdirSync(path.join(repo, 'seo'), { recursive: true });
    writeFileSync(path.join(repo, 'data', 'seo', 'monitor-state.json'), '{"open":[]}');
    writeFileSync(path.join(repo, 'seo', 'check.ts'), 'original');
    sh(repo, 'add', '-A');
    sh(repo, 'commit', '-q', '-m', 'base');

    // State written by the monitor before repair runs, uncommitted.
    writeFileSync(path.join(repo, 'data', 'seo', 'monitor-state.json'), '{"open":["X"]}');
    writeFileSync(path.join(repo, 'data', 'seo', 'repair-spend.json'), '{"spent":0.4}');

    // The agent's work on its branch: an edit, a new file, a new staged file.
    sh(repo, 'checkout', '-q', '-b', 'seo-autofix-x');
    writeFileSync(path.join(repo, 'seo', 'check.ts'), 'agent edit');
    writeFileSync(path.join(repo, 'seo', 'new.ts'), 'agent file');
    writeFileSync(path.join(repo, 'seo', 'staged.ts'), 'agent staged');
    sh(repo, 'add', 'seo/staged.ts');

    process.chdir(repo);
    await abandon('main', 'seo-autofix-x');
    process.chdir(cwd);

    assert.equal(sh(repo, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
    assert.equal(readFileSync(path.join(repo, 'seo', 'check.ts'), 'utf-8'), 'original', 'agent edit reverted');
    assert(!existsSync(path.join(repo, 'seo', 'new.ts')), 'agent-created file removed');
    assert(!existsSync(path.join(repo, 'seo', 'staged.ts')), 'agent-staged file removed, not carried to main');
    assert.equal(sh(repo, 'branch', '--list', 'seo-autofix-x'), '', 'branch deleted');

    assert.equal(readFileSync(path.join(repo, 'data', 'seo', 'monitor-state.json'), 'utf-8'), '{"open":["X"]}',
      'monitor state must survive, or the same defect re-alerts every day');
    assert.equal(readFileSync(path.join(repo, 'data', 'seo', 'repair-spend.json'), 'utf-8'), '{"spent":0.4}',
      'spend record must survive, or the monthly budget undercounts');
  } finally {
    process.chdir(cwd);
    rmSync(repo, { recursive: true, force: true });
  }
});
