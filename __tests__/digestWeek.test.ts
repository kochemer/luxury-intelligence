import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Settings } from 'luxon';
import { getCurrentDigestWeek, getCurrentIngestionWeek } from '../lib/utils/getCurrentDigestWeek';

// The weekly build runs Monday 06:00 UTC for the week that just ended.
const at = (iso: string) => { Settings.now = () => Date.parse(iso); };
after(() => { Settings.now = () => Date.now(); });

test('Monday build: digest and ingestion both target the week that just ended', () => {
  at('2026-10-19T06:00:00Z');
  assert.equal(getCurrentDigestWeek(), '2026-W42');
  assert.equal(getCurrentIngestionWeek(), '2026-W42');
});

test('Tuesday–Sunday ingestion collects for the week in progress', () => {
  at('2026-10-13T05:30:00Z');
  assert.equal(getCurrentIngestionWeek(), '2026-W42');
  at('2026-10-18T05:30:00Z');
  assert.equal(getCurrentIngestionWeek(), '2026-W42');
});

test('site week: previous week Mon–Sat, current (unbuilt, falls back) on Sunday', () => {
  at('2026-10-14T12:00:00Z');
  assert.equal(getCurrentDigestWeek(), '2026-W41');
  at('2026-10-18T12:00:00Z');
  assert.equal(getCurrentDigestWeek(), '2026-W42');
});

test('year boundary uses ISO week-year', () => {
  at('2027-01-04T06:00:00Z'); // Monday of 2027-W01
  assert.equal(getCurrentDigestWeek(), '2026-W53');
  assert.equal(getCurrentIngestionWeek(), '2026-W53');
});
