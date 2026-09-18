import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySvixSignature } from '../lib/webhooks/svix';

// A Svix-style secret: "whsec_" + base64 key.
const KEY = Buffer.from('0123456789abcdef0123456789abcdef');
const SECRET = `whsec_${KEY.toString('base64')}`;

function sign(id: string, ts: string, body: string, key: Buffer = KEY): string {
  return `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`;
}

const now = () => String(Math.floor(Date.now() / 1000));

test('accepts a correctly signed, fresh payload', () => {
  const body = JSON.stringify({ type: 'email.bounced', data: { to: ['a@example.com'] } });
  const ts = now();
  const r = verifySvixSignature({ secret: SECRET, id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body), body });
  assert.equal(r.ok, true);
});

test('accepts when one of several space-separated signatures matches', () => {
  const body = '{}';
  const ts = now();
  const good = sign('msg_2', ts, body);
  const stale = sign('msg_2', ts, body, Buffer.from('another-key-entirely-0000000000'));
  const r = verifySvixSignature({ secret: SECRET, id: 'msg_2', timestamp: ts, signature: `${stale} ${good}`, body });
  assert.equal(r.ok, true);
});

test('rejects a tampered body', () => {
  const ts = now();
  const sig = sign('msg_3', ts, '{"type":"email.bounced"}');
  const r = verifySvixSignature({ secret: SECRET, id: 'msg_3', timestamp: ts, signature: sig, body: '{"type":"email.delivered"}' });
  assert.equal(r.ok, false);
});

test('rejects a stale timestamp even with a valid signature', () => {
  const body = '{}';
  const ts = String(Math.floor(Date.now() / 1000) - 10 * 60);
  const r = verifySvixSignature({ secret: SECRET, id: 'msg_4', timestamp: ts, signature: sign('msg_4', ts, body), body });
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /tolerance/);
});

test('rejects missing headers and the wrong secret', () => {
  const body = '{}';
  const ts = now();
  assert.equal(verifySvixSignature({ secret: SECRET, id: null, timestamp: ts, signature: 'v1,abc', body }).ok, false);
  const other = `whsec_${Buffer.from('ffffffffffffffffffffffffffffffff').toString('base64')}`;
  assert.equal(verifySvixSignature({ secret: other, id: 'msg_5', timestamp: ts, signature: sign('msg_5', ts, body), body }).ok, false);
});
