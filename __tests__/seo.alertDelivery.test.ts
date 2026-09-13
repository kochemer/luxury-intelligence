/**
 * Alert delivery must report failure as failure.
 *
 * The bug this guards: Resend v4 resolves (does not throw) when it rejects an
 * email, returning `{ error }`. The sender awaited the call, ignored the result
 * and logged "✓ Alert emailed" either way. On a healthy site nothing is ever
 * sent, so the bug was invisible — until the one day an alert mattered.
 *
 * The sender is injected rather than stubbed on Resend's prototype. The first
 * version of these tests patched the prototype; Resend assigns `emails` in its
 * constructor, so construction threw, the catch returned false, and three of
 * four tests passed without exercising the logic they named. The "genuine
 * acceptance" case is what exposed that — keep a positive case in any test of
 * a failure path, or a broken harness looks like a working one.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { sendAlert, type EmailSender, type OutgoingEmail } from '../seo/monitor/alert';
import type { MonitorResult } from '../seo/monitor/runMonitor';

const RESULT: MonitorResult = {
  checkedAtISO: '2026-09-13T07:00:00.000Z',
  siteUrl: 'https://example.test',
  healthy: false,
  problems: [],
  newProblems: [{
    id: 'LIVE_NON_200:abc', code: 'LIVE_NON_200', severity: 'critical', category: 'indexing',
    title: 'Page down', detail: 'detail', recommendation: 'fix', score: 0, firstSeenWeek: '', weeksOpen: 1,
  }],
  resolvedProblems: [],
  trafficNote: null,
};

async function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  const keys = ['SEO_ALERT_EMAIL', 'EMAIL_FROM', 'RESEND_API_KEY'] as const;
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.SEO_ALERT_EMAIL = 'owner@example.test';
  process.env.EMAIL_FROM = 'Monitor <monitor@example.test>';
  process.env.RESEND_API_KEY = 're_test_key';
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

/** A sender that records what it was asked to send, then responds as told. */
function fakeSender(respond: () => Promise<Awaited<ReturnType<EmailSender>>>) {
  const sent: OutgoingEmail[] = [];
  const send: EmailSender = async (email) => { sent.push(email); return respond(); };
  return { send, sent };
}

test('a genuine acceptance is reported as delivered', async () => {
  // The positive case first. Without it, a harness that never reaches the
  // sender at all would make every failure test pass.
  const { send, sent } = fakeSender(async () => ({ data: { id: 'msg-123' }, error: null }));
  const delivered = await withEnv(() => sendAlert(RESULT, send));

  assert.equal(delivered, true);
  assert.equal(sent.length, 1, 'the sender must actually have been called');
  assert.equal(sent[0]!.to, 'owner@example.test');
  assert.match(sent[0]!.subject, /1 new SEO problem/);
});

test('a rejection returned by Resend is reported as a failure, not a success', async () => {
  // The exact response shape Resend returns on rejection.
  const { send, sent } = fakeSender(async () => ({
    data: null,
    error: { message: 'The digest.luxury-intel.com domain is not verified' },
  }));
  const delivered = await withEnv(() => sendAlert(RESULT, send));

  assert.equal(sent.length, 1, 'the send must have been attempted');
  assert.equal(delivered, false, 'a resolved promise carrying an error is not a delivery');
});

test('an error is decisive even when a message id is also present', async () => {
  // Isolates the `response.error` check. The test above cannot do that on its
  // own: with `data: null`, removing the error check makes the success path
  // read `response.data.id`, which throws, and the catch returns false — so
  // that test kept passing with the guard deleted. Supplying an id here means
  // only the error check stands between this response and a false "delivered".
  const { send } = fakeSender(async () => ({
    data: { id: 'msg-should-not-count' },
    error: { message: 'rate limited' },
  }));
  const delivered = await withEnv(() => sendAlert(RESULT, send));

  assert.equal(delivered, false, 'an error must override an id, never be ignored because one exists');
});

test('a response with no message id is not treated as delivered', async () => {
  const { send, sent } = fakeSender(async () => ({ data: {}, error: null }));
  const delivered = await withEnv(() => sendAlert(RESULT, send));

  assert.equal(sent.length, 1);
  assert.equal(delivered, false, 'without an id there is no evidence the message was accepted');
});

test('a thrown network error is reported as a failure', async () => {
  const { send, sent } = fakeSender(async () => { throw new Error('ECONNRESET'); });
  const delivered = await withEnv(() => sendAlert(RESULT, send));

  assert.equal(sent.length, 1);
  assert.equal(delivered, false);
});

test('missing configuration does not attempt a send', async () => {
  const { send, sent } = fakeSender(async () => ({ data: { id: 'x' }, error: null }));
  const saved = process.env.SEO_ALERT_EMAIL;
  delete process.env.SEO_ALERT_EMAIL;
  try {
    const delivered = await sendAlert(RESULT, send);
    assert.equal(delivered, false);
    assert.equal(sent.length, 0, 'with no recipient configured, nothing should be sent');
  } finally {
    if (saved !== undefined) process.env.SEO_ALERT_EMAIL = saved;
  }
});
