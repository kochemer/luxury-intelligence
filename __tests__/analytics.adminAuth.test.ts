/** Password gate for /analytics. */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkPassword, isValidSession } from '../lib/analytics/adminAuth';

function withPassword(value: string | undefined, fn: () => void) {
  const saved = process.env.ANALYTICS_PASSWORD;
  if (value === undefined) delete process.env.ANALYTICS_PASSWORD;
  else process.env.ANALYTICS_PASSWORD = value;
  try { fn(); } finally {
    if (saved === undefined) delete process.env.ANALYTICS_PASSWORD;
    else process.env.ANALYTICS_PASSWORD = saved;
  }
}

test('no password configured: nothing gets in', () => {
  withPassword(undefined, () => {
    assert.equal(checkPassword(''), null);
    assert.equal(checkPassword('anything'), null);
    assert.equal(isValidSession('anything'), false);
  });
});

test('right password yields a session that validates; wrong one does not', () => {
  withPassword('correct horse', () => {
    assert.equal(checkPassword('wrong'), null);
    assert.equal(checkPassword(''), null);
    const token = checkPassword('correct horse');
    assert.ok(token);
    assert.notEqual(token, 'correct horse', 'the cookie never holds the password itself');
    assert.equal(isValidSession(token!), true);
    assert.equal(isValidSession(token! + 'x'), false);
    assert.equal(isValidSession(undefined), false);
  });
});

test('changing the password signs everyone out', () => {
  let token: string | null = null;
  withPassword('first', () => { token = checkPassword('first'); });
  withPassword('second', () => { assert.equal(isValidSession(token!), false); });
});
