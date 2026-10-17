import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidReplayId, mergeReplayEvents } from '../lib/analytics/replay';

const DEVICE = '00000000-1111-4222-8333-444444444444';

test('isValidReplayId accepts device id / session id', () => {
  assert.equal(isValidReplayId(`${DEVICE}/1791873065791`), true);
  assert.equal(isValidReplayId(`${DEVICE.toUpperCase()}/1791873065791`), true);
  assert.equal(isValidReplayId(`${DEVICE}R/1791873065791`), true);
  assert.equal(isValidReplayId(`${DEVICE}/1234567890`), true);   // 10 digits
  assert.equal(isValidReplayId(`${DEVICE}/1234567890123456`), true); // 16 digits
});

test('isValidReplayId rejects wrong lengths and shapes', () => {
  assert.equal(isValidReplayId(`${DEVICE}/123456789`), false);       // 9 digits
  assert.equal(isValidReplayId(`${DEVICE}/12345678901234567`), false); // 17 digits
  assert.equal(isValidReplayId(`${DEVICE}/`), false);
  assert.equal(isValidReplayId(`/1791873065791`), false);
  assert.equal(isValidReplayId(DEVICE), false);
  assert.equal(isValidReplayId('00000000-1111-4222-8333-44444444444/1791873065791'), false);
  assert.equal(isValidReplayId(`${DEVICE}/abcdefghijkl`), false);
  assert.equal(isValidReplayId(''), false);
  assert.equal(isValidReplayId(undefined), false);
  assert.equal(isValidReplayId(null), false);
  assert.equal(isValidReplayId(42), false);
});

test('isValidReplayId rejects path traversal, extra characters and whitespace', () => {
  assert.equal(isValidReplayId(`../${DEVICE}/1791873065791`), false);
  assert.equal(isValidReplayId(`${DEVICE}/../1791873065791`), false);
  assert.equal(isValidReplayId(`${DEVICE}/1791873065791/..`), false);
  assert.equal(isValidReplayId(`${DEVICE}/1791873065791/extra`), false);
  assert.equal(isValidReplayId(`${DEVICE}/1791873065791?x=1`), false);
  assert.equal(isValidReplayId(`${DEVICE}/1791873065791#a`), false);
  assert.equal(isValidReplayId(`${DEVICE}/1791873065791\n`), false);
  assert.equal(isValidReplayId(` ${DEVICE}/1791873065791`), false);
  assert.equal(isValidReplayId(`${DEVICE}%2F1791873065791`), false);
  assert.equal(isValidReplayId(`${DEVICE}\\1791873065791`), false);
  assert.equal(isValidReplayId(`${DEVICE}/1791873065791\0`), false);
  assert.equal(isValidReplayId(`${DEVICE.replace('0000', 'zzzz')}/1791873065791`), false);
});

test('mergeReplayEvents sorts across files by timestamp', () => {
  const merged = mergeReplayEvents([
    [{ type: 3, timestamp: 30 }, { type: 3, timestamp: 40 }],
    [{ type: 4, timestamp: 10 }, { type: 2, timestamp: 20 }],
  ]);
  assert.deepEqual(merged.map(e => e.timestamp), [10, 20, 30, 40]);
});

test('mergeReplayEvents keeps file order for equal timestamps', () => {
  const merged = mergeReplayEvents([
    [{ type: 4, timestamp: 5, n: 1 }, { type: 2, timestamp: 5, n: 2 }, { type: 3, timestamp: 5, n: 3 }],
  ]);
  assert.deepEqual(merged.map(e => e.n), [1, 2, 3]);
});

test('mergeReplayEvents handles no files and empty files', () => {
  assert.deepEqual(mergeReplayEvents([]), []);
  assert.deepEqual(mergeReplayEvents([[], []]), []);
  assert.deepEqual(mergeReplayEvents([[], [{ type: 2, timestamp: 1 }]]).length, 1);
});

test('mergeReplayEvents drops anything that is not an event', () => {
  const merged = mergeReplayEvents([
    [{ type: 2, timestamp: 2 }, null, 'x', 7, { type: 3 }, { type: 3, timestamp: 'late' }, { type: 3, timestamp: NaN }],
    { not: 'an array' },
    null,
    [{ type: 3, timestamp: 1 }],
  ]);
  assert.deepEqual(merged.map(e => e.timestamp), [1, 2]);
});
