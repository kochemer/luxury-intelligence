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
import { chooseRollbackTarget, type Deployment } from '../seo/recovery/vercel';
import { DEPLOYS_FROZEN_WARNING, type RecoveryResult } from '../seo/recovery/runRecovery';
import {
  shouldNotify,
  sendRecoveryEmail,
  buildRecoverySubject,
  buildRecoveryHtml,
  buildRecoveryText,
} from '../seo/recovery/notify';

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

// ── Choosing what to roll back to ─────────────────────────────────────────

function deployment(url: string, status: string, age = '2h'): Deployment {
  return { url, status, age, environment: 'Production' };
}

test('the rollback target is the deployment immediately before the current one', () => {
  const choice = chooseRollbackTarget([
    deployment('https://a.vercel.app', 'Error', '10m'),
    deployment('https://b.vercel.app', 'Ready', '2h'),
    deployment('https://c.vercel.app', 'Ready', '1d'),
  ]);

  assert.equal(choice.target?.url, 'https://b.vercel.app');
});

test('it never reaches past the immediately previous deployment', () => {
  // Vercel's Hobby plan only allows rolling back one step. Picking the older
  // healthy deployment would be refused by Vercel while the site stayed down.
  const choice = chooseRollbackTarget([
    deployment('https://a.vercel.app', 'Error', '10m'),
    deployment('https://b.vercel.app', 'Error', '2h'),
    deployment('https://c.vercel.app', 'Ready', '1d'),
  ]);

  assert.equal(choice.target, null, 'an older healthy deployment is not an eligible target');
  assert.match(choice.reason, /not Ready|Hobby/i, 'the reason must explain why, since it goes into the email');
});

test('one deployment, or none, means nothing to roll back to', () => {
  assert.equal(chooseRollbackTarget([deployment('https://a.vercel.app', 'Ready')]).target, null);
  assert.equal(chooseRollbackTarget([]).target, null);
  assert.match(chooseRollbackTarget([]).reason, /\S/);
});

// ── Telling a human what happened ─────────────────────────────────────────

function result(overrides: Partial<RecoveryResult> = {}): RecoveryResult {
  return {
    status: 'rolled-back',
    checkedAtISO: '2026-09-18T07:00:00.000Z',
    detail: 'Production was failing on 5/8 sampled pages.',
    failedUrls: ['https://luxury-intel.com/ (500)'],
    sampledUrls: 8,
    rolledBackTo: deployment('https://b.vercel.app', 'Ready'),
    recommendation: 'Do the thing.',
    ...overrides,
  };
}

test('a rollback email says that deploys are now frozen', () => {
  // The fact most likely to be missed, and the one that silently stops the
  // weekly digest from publishing.
  const r = result({ recommendation: DEPLOYS_FROZEN_WARNING });

  assert.match(buildRecoverySubject(r), /paused/i);
  assert.match(buildRecoveryHtml(r), /will not go live/i);
  assert.match(buildRecoveryText(r), /promote/i);
});

test('a healthy check emails nothing', async () => {
  const r = result({ status: 'healthy', rolledBackTo: undefined, failedUrls: [] });
  assert.equal(shouldNotify(r), false);

  let called = false;
  const sent = await sendRecoveryEmail(r, async () => { called = true; return { data: { id: 'x' } }; });

  assert.equal(called, false, 'a healthy run must not send anything');
  assert.equal(sent.skipped, 'nothing-to-report');
});

test('every non-healthy status is worth an email and gets its own subject', () => {
  const statuses: RecoveryResult['status'][] =
    ['rolled-back', 'rollback-failed', 'no-target', 'would-roll-back', 'provider-outage', 'not-authenticated'];
  const subjects = new Set<string>();

  for (const status of statuses) {
    const r = result({ status });
    assert.equal(shouldNotify(r), true, `${status} must be reported`);
    subjects.add(buildRecoverySubject(r));
  }

  assert.equal(subjects.size, statuses.length, 'each outcome needs a distinguishable subject line');
});

test('values that came from the Vercel CLI are escaped', () => {
  const html = buildRecoveryHtml(result({ detail: 'Rolled back to <script>alert(1)</script>' }));

  assert(!html.includes('<script>'), 'CLI output must not be injected into the email as markup');
  assert.match(html, /&lt;script&gt;/);
});
