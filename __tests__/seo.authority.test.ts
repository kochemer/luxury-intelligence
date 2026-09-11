/**
 * Authority-level and guardrail tests.
 *
 * The guardrail assertions matter most: they are what stands between
 * "experiment with an autonomous agent on a pet project" and "an autonomous
 * agent deleted the pet project". They must hold at every authority level,
 * including the highest.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getAuthority, describeAuthority, assertGuardrails } from '../seo/authority';

function withAuthority<T>(level: string | undefined, fn: () => T): T {
  const previous = process.env.SEO_AGENT_AUTHORITY;
  if (level === undefined) delete process.env.SEO_AGENT_AUTHORITY;
  else process.env.SEO_AGENT_AUTHORITY = level;
  try { return fn(); } finally {
    if (previous === undefined) delete process.env.SEO_AGENT_AUTHORITY;
    else process.env.SEO_AGENT_AUTHORITY = previous;
  }
}

test('unset authority grants nothing', () => {
  const a = withAuthority(undefined, getAuthority);
  assert.equal(a.level, 'observe');
  assert.equal(a.canOpenPullRequests, false);
  assert.equal(a.canRollbackDeployments, false);
  assert.equal(a.canRevertCommits, false);
  assert.equal(a.canMergePullRequests, false);
});

test('a typo grants nothing rather than something', () => {
  // Authority must never be conferred by a misspelling. "autonmy" is not
  // "autonomy" and must fall back to the safest level, not the nearest.
  for (const typo of ['autonmy', 'AUTONOMY!', 'yes', 'true', 'full', '']) {
    const a = withAuthority(typo, getAuthority);
    assert.equal(a.level, 'observe', `"${typo}" must not grant authority`);
    assert.equal(a.canMergePullRequests, false);
  }
});

test('levels are additive in order of how hard actions are to undo', () => {
  const propose = withAuthority('propose', getAuthority);
  assert.equal(propose.canOpenPullRequests, true);
  assert.equal(propose.canRollbackDeployments, false, 'propose must not touch production');

  const recover = withAuthority('recover', getAuthority);
  assert.equal(recover.canOpenPullRequests, true);
  assert.equal(recover.canRollbackDeployments, true);
  assert.equal(recover.canMergePullRequests, false, 'recover must not merge unreviewed code');

  const autonomy = withAuthority('autonomy', getAuthority);
  assert.equal(autonomy.canOpenPullRequests, true);
  assert.equal(autonomy.canRollbackDeployments, true);
  assert.equal(autonomy.canMergePullRequests, true);
  assert.equal(autonomy.canRevertCommits, true,
    'if merges can happen unreviewed, rollback must also be able to revert the commit');
});

test('case and whitespace are tolerated in the level name', () => {
  for (const variant of ['AUTONOMY', ' autonomy ', 'Autonomy']) {
    assert.equal(withAuthority(variant, getAuthority).level, 'autonomy', `"${variant}"`);
  }
});

test('authority is described in plain language', () => {
  assert.match(withAuthority('observe', () => describeAuthority(getAuthority())), /reports only/);
  assert.match(withAuthority('autonomy', () => describeAuthority(getAuthority())), /merge its own PRs/);
});

test('guardrails pass with the policy as shipped', () => {
  assert.doesNotThrow(() => assertGuardrails());
});

test('guardrails hold at the highest authority level', () => {
  // The whole point: autonomy widens what the agent may *decide*, never what
  // it may *reach*.
  withAuthority('autonomy', () => {
    assert.doesNotThrow(() => assertGuardrails());
  });
});
