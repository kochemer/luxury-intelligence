import test from 'node:test';
import assert from 'node:assert/strict';
import {
  axisLabel, barTitle, cameFromText, copenhagenWhen, dayMonth, dayMonthYear, formatDuration,
  formatVital, isMonthlySeries, pageName, pagePath, placeText, taggedNote, visitorLetters,
} from '../lib/analytics/display';

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(57), '57 s');
  assert.equal(formatDuration(190), '3 m 10 s');
  assert.equal(formatDuration(546), '9 m 06 s');
  assert.equal(formatDuration(60), '1 m 00 s');
  assert.equal(formatDuration(3720), '1 h 2 m');
  assert.equal(formatDuration(-4), '0 s');
});

test('pageName', () => {
  assert.equal(pageName('/'), 'Home');
  assert.equal(pageName(''), 'Home');
  assert.equal(pageName('/about'), 'About');
  assert.equal(pageName('/subscribe?x=1'), 'Subscribe');
  assert.equal(pageName('/digest/october-2026-week-41'), 'Digest W41');
  assert.equal(pageName('/digest/october-2026-week-7/'), 'Digest W7');
  assert.equal(pageName('/markets/luxury'), 'Markets');
  assert.equal(pageName('/competitor-watch'), 'Competitor watch');
});

test('pagePath merges consecutive repeats', () => {
  assert.equal(pagePath(['/', '/', '/about', '/']), 'Home → About → Home');
  assert.equal(pagePath(['/about', '/about']), 'About');
  assert.equal(pagePath([]), 'Home');
});

test('taggedNote and cameFromText', () => {
  assert.equal(taggedNote('2026-W41 · read_online_cta'), 'W41 · read online');
  assert.equal(taggedNote('2026-w42 · story-tue'), 'W42 · story Tue');
  assert.equal(taggedNote('2026-W42'), 'W42');
  assert.equal(taggedNote('thread'), 'thread');
  assert.equal(taggedNote('2026-W42 · issue-post'), 'W42 · issue post');
  assert.equal(taggedNote(undefined), '');
  assert.equal(taggedNote(''), '');
  const classify = (d: string) => (d === 'linkedin.com' ? 'LinkedIn' : 'Other sites');
  assert.deepEqual(cameFromText({ kind: 'tagged', label: 'newsletter', detail: '2026-W41 · read_online_cta' }, classify),
    { label: 'Newsletter', note: 'W41 · read online' });
  assert.deepEqual(cameFromText({ kind: 'tagged', label: 'chatgpt.com' }, classify), { label: 'ChatGPT', note: undefined });
  assert.equal(cameFromText({ kind: 'tagged', label: 'x' }, classify).label, 'X');
  assert.equal(cameFromText({ kind: 'tagged', label: 'bing' }, classify).label, 'bing');
  assert.deepEqual(cameFromText({ kind: 'site', label: 'linkedin.com' }, classify), { label: 'LinkedIn', title: 'linkedin.com' });
  assert.deepEqual(cameFromText({ kind: 'direct', label: 'Direct / email / app' }, classify), { label: 'Direct / email / app' });
});

test('placeText', () => {
  assert.equal(placeText('Copenhagen', 'Denmark'), 'Copenhagen, Denmark');
  assert.equal(placeText(null, 'Denmark'), 'Denmark');
  assert.equal(placeText(null, null), 'Location unknown');
});

test('dates', () => {
  assert.equal(dayMonth('2026-01-31'), '31 Jan');
  assert.equal(dayMonth('2026-05-04'), '4 May');
  assert.equal(dayMonthYear('2026-10-16'), '16 Oct 2026');
  assert.equal(copenhagenWhen('2026-10-13T06:31:05.000Z'), 'Tue 13 Oct 08:31'); // CEST
  assert.equal(copenhagenWhen('2026-12-01T23:30:00.000Z'), 'Wed 2 Dec 00:30');  // CET, next day
});

test('month vs week axis labels', () => {
  const weeks = ['2026-05-04', '2026-05-11', '2026-05-18'];
  const months = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01'];
  assert.equal(isMonthlySeries(weeks), false);
  assert.equal(isMonthlySeries(months), true);
  assert.equal(isMonthlySeries(['2026-05-01']), false);
  assert.equal(isMonthlySeries([]), false);
  assert.equal(isMonthlySeries(['2026-01-01', '2026-02-01', '2026-03-01']), true); // 31 and 28 days
  assert.equal(axisLabel('2026-05-18', false), '18 May');
  assert.equal(axisLabel('2026-05-01', true), 'May');
  assert.equal(barTitle('2026-05-18', 407, false), 'Week of 18 May: 407');
  assert.equal(barTitle('2026-05-01', 1234, true), 'May: 1,234');
});

test('formatVital', () => {
  assert.equal(formatVital('TTFB', 365), '365 ms');
  assert.equal(formatVital('LCP', 1530), '1.53 s');
  assert.equal(formatVital('LCP', 999.6), '1000 ms');
  assert.equal(formatVital('INP', 72), '72 ms');
  assert.equal(formatVital('CLS', 0.0012), '0.001');
  assert.equal(formatVital('CLS', 0), '0.000');
});

test('visitorLetters orders by number of sessions', () => {
  const m = visitorLetters(['p1', 'p2', 'p2', 'p3', 'p2', 'p3']);
  assert.equal(m.get('p2'), 'A');
  assert.equal(m.get('p3'), 'B');
  assert.equal(m.get('p1'), 'C');
  const tie = visitorLetters(['x', 'y']);
  assert.equal(tie.get('x'), 'A');
  assert.equal(tie.get('y'), 'B');
});
