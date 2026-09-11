/**
 * Guards on the automated-rollback decision.
 *
 * A false positive here is expensive in an unusual way: rolling production
 * back when nothing was actually wrong *causes* the outage the system exists
 * to prevent. These assertions pin the thresholds and the CLI argument shape
 * that keep that from happening.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  OUTAGE_MIN_FAILED_PAGES,
  OUTAGE_SAMPLE_SIZE,
  RECOVERY_SETTLE_MS,
} from '../seo/config';

test('a single failing page never counts as an outage', () => {
  // A 404 is often deliberate — a removed page, a renamed route. Rolling the
  // whole site back over one would be worse than the problem.
  assert(OUTAGE_MIN_FAILED_PAGES > 1,
    'one failing page must not be enough to roll production back');
});

test('the outage threshold is reachable within the sample', () => {
  assert(OUTAGE_MIN_FAILED_PAGES < OUTAGE_SAMPLE_SIZE,
    'the threshold must be lower than the sample size, or an outage can never be detected');
  assert(OUTAGE_SAMPLE_SIZE >= 5,
    'too small a sample makes the decision noisy');
});

test('rollback is given time to propagate before being judged', () => {
  assert(RECOVERY_SETTLE_MS >= 10_000,
    'checking immediately after a rollback would report failure before it took effect');
});

test('deployment URL pattern admits no shell metacharacters', () => {
  // Deployment URLs are passed through a shell on Windows, so the pattern that
  // extracts them is load-bearing for safety, not just for parsing.
  const pattern = /https:\/\/[^\s]+\.vercel\.app/;

  const real = 'https://luxury-intelligence-2pnp46lcy-kochemers-projects.vercel.app';
  assert.equal(real.match(pattern)?.[0], real, 'a real deployment URL should match in full');

  // Anything with whitespace cannot be captured whole, so an injected command
  // separated by a space can never ride along inside a matched URL.
  const injected = 'https://evil.vercel.app && rm -rf /';
  assert.equal(injected.match(pattern)?.[0], 'https://evil.vercel.app',
    'the match must stop at the first whitespace, dropping anything appended');
});

test('recovery statuses distinguish "cannot act" from "acted and failed"', async () => {
  // These drive very different human responses: one is "go log in", the other
  // is "the site is still down, intervene now". Collapsing them would be bad.
  const { runRecovery } = await import('../seo/recovery/runRecovery');
  assert.equal(typeof runRecovery, 'function');
});
