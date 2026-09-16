import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinWeekWindow, filterToWeekWindow } from '../digest/buildWeeklyDigest';

// A concrete week window: Mon 2026-06-01 00:00Z .. Sun 2026-06-07 23:59:59Z
const START = Date.parse('2026-06-01T00:00:00.000Z');
const END = Date.parse('2026-06-07T23:59:59.999Z');

test('includes an article published early in the week (Monday)', () => {
  assert.equal(isWithinWeekWindow({ published_at: '2026-06-01T09:00:00Z' }, START, END), true);
});

test('includes an article published late in the week (Friday) — weekday-agnostic', () => {
  assert.equal(isWithinWeekWindow({ published_at: '2026-06-05T18:30:00Z' }, START, END), true);
});

test('excludes an article published before the window', () => {
  assert.equal(isWithinWeekWindow({ published_at: '2026-05-31T23:59:59Z' }, START, END), false);
});

test('excludes an article published after the window', () => {
  assert.equal(isWithinWeekWindow({ published_at: '2026-06-08T00:00:01Z' }, START, END), false);
});

test('excludes an article with no date', () => {
  assert.equal(isWithinWeekWindow({}, START, END), false);
  assert.equal(isWithinWeekWindow({ published_at: '' }, START, END), false);
});

test('excludes an article with an unparseable date', () => {
  assert.equal(isWithinWeekWindow({ published_at: 'not-a-date' }, START, END), false);
});

test('boundaries are inclusive at both ends', () => {
  assert.equal(isWithinWeekWindow({ published_at: '2026-06-01T00:00:00.000Z' }, START, END), true);
  assert.equal(isWithinWeekWindow({ published_at: '2026-06-07T23:59:59.999Z' }, START, END), true);
});

test('filterToWeekWindow keeps only in-window, dated articles', () => {
  const input = [
    { published_at: '2026-06-02T10:00:00Z', id: 'in-1' },
    { published_at: '2026-05-20T10:00:00Z', id: 'old' },
    { published_at: undefined, id: 'undated' },
    { published_at: '2026-06-06T10:00:00Z', id: 'in-2' },
  ];
  const kept = filterToWeekWindow(input, START, END).map(a => a.id);
  assert.deepEqual(kept, ['in-1', 'in-2']);
});
