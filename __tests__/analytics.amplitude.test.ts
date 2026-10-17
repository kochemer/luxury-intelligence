/** Amplitude sections of /analytics: window clamping, sessions, returning, engagement, vitals. Synthetic data only. */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  CONSENT_START,
  __setSleepForTests,
  amplitudeGet,
  amplitudeWindow,
  buildSessions,
  cameFromPageView,
  engagementStats,
  getWebVitals,
  listReplays,
  mergeTaggedRows,
  median,
  parseSegmentation,
  parseTaggedUrl,
  rateVital,
  retryDelayMs,
  returningStats,
  vitalFromCounts,
  vitalPairs,
  type ActivityEvent,
  type Replay,
  type UserActivity,
  type VisitSession,
} from '../lib/analytics/amplitude';

// ---------------------------------------------------------------- windows

test('amplitudeWindow clamps to the consent start and today', () => {
  const today = '2026-10-16';
  assert.deepEqual(amplitudeWindow({ start: '2026-01-01', end: '2026-12-31' }, today), { start: CONSENT_START, end: today });
  assert.deepEqual(amplitudeWindow({ start: '2026-10-08', end: '2026-10-10' }, today), { start: '2026-10-08', end: '2026-10-10' });
  assert.equal(amplitudeWindow({ start: '2026-01-01', end: '2026-10-05' }, today), null);
  assert.equal(amplitudeWindow({ start: '2026-10-17', end: '2026-10-20' }, today), null);
});

// ---------------------------------------------------------------- sessions

const ev = (over: Partial<ActivityEvent> & { type: string; time: string; sessionId: string }): ActivityEvent => ({
  props: {}, country: null, city: null, deviceType: null, ...over,
});

const person = (over: Partial<UserActivity> = {}): UserActivity => ({
  firstSeen: '2026-10-01', os: 'Chrome', device: 'Mac', country: 'Testland', city: 'Testville', events: [], ...over,
});

const replay = (over: Partial<Replay> = {}): Replay => ({
  replayId: 'dev/100', sessionId: '100', deviceId: 'dev', amplitudeId: 'p1',
  start: '2026-10-13T06:00:00.000Z', end: '2026-10-13T06:01:30.400Z', ...over,
});

test('buildSessions matches events by session id and orders page views', () => {
  const events = [
    ev({ type: 'page_view', time: '2026-10-13T06:00:20.000Z', sessionId: '100', props: { route_path: '/digest/x' } }),
    ev({ type: 'page_view', time: '2026-10-13T06:00:00.500Z', sessionId: '100', props: { route_path: '/' }, country: 'Aland', city: 'Alandcity', deviceType: 'iPhone' }),
    ev({ type: 'page_view', time: '2026-10-13T09:00:00.000Z', sessionId: '999', props: { route_path: '/other' } }),
    ev({ type: 'digest_view', time: '2026-10-13T06:00:21.000Z', sessionId: '100' }),
    ev({ type: 'article_click', time: '2026-10-13T06:00:40.000Z', sessionId: '100' }),
    ev({ type: 'checkout_complete', time: '2026-10-13T06:01:00.000Z', sessionId: '100' }),
  ];
  const [s] = buildSessions([replay()], new Map([['p1', person({ events })]]));
  assert.ok(s);
  assert.deepEqual(s.paths, ['/', '/digest/x']);
  assert.equal(s.pages, 2);
  assert.equal(s.durationS, 90);
  assert.deepEqual(s.actions, ['subscribed', 'digest', 'article']);
  assert.equal(s.country, 'Aland');
  assert.equal(s.device, 'iPhone');
  assert.equal(s.firstVisit, false);
});

test('buildSessions: firstVisit when first seen on the session day; falls back to userData', () => {
  const [s] = buildSessions([replay()], new Map([['p1', person({ firstSeen: '2026-10-13', events: [] })]]));
  assert.ok(s);
  assert.equal(s.firstVisit, true);
  assert.equal(s.country, 'Testland');
  assert.equal(s.pages, 0);
  assert.equal(s.cameFrom.kind, 'direct');
});

test('buildSessions drops bots and unknown people', () => {
  const people = new Map([
    ['p1', person({ os: 'HeadlessChrome' })],
    ['p2', person({ os: 'Baiduspider' })],
    ['p3', person({ device: 'Linux' })],
    ['p4', person()],
  ]);
  const replays = ['p1', 'p2', 'p3', 'p4', 'p5'].map(id => replay({ amplitudeId: id, replayId: id }));
  assert.deepEqual(buildSessions(replays, people).map(s => s.personId), ['p4']);
});

test('cameFromPageView: tagged landing URL', () => {
  const r = cameFromPageView({
    '[Amplitude] Page Location': 'https://example.com/?utm_source=newsletter&utm_campaign=2026-W41&utm_content=read_online_cta',
  });
  assert.deepEqual(r, { kind: 'tagged', label: 'newsletter', detail: '2026-W41 · read_online_cta' });
});

test('cameFromPageView: external previous page, www stripped', () => {
  const r = cameFromPageView({
    '[Amplitude] Page Location': 'https://example.com/',
    '[Amplitude] Previous Page Type': 'external',
    '[Amplitude] Previous Page Location': 'https://www.example.org/some/page',
  });
  assert.deepEqual(r, { kind: 'site', label: 'example.org' });
});

test('cameFromPageView: direct, and sticky utm event props are ignored', () => {
  const r = cameFromPageView({
    '[Amplitude] Page Location': 'https://example.com/',
    '[Amplitude] Previous Page Type': 'direct',
    utm_source: 'newsletter',
    utm_campaign: 'old',
    acq_source: 'newsletter',
  });
  assert.deepEqual(r, { kind: 'direct', label: 'Direct / email / app' });
});

// ---------------------------------------------------------------- returning

const sess = (personId: string, start: string, firstSeen: string | null): VisitSession => ({
  replayId: `${personId}-${start}`, personId, start, durationS: 30, pages: 1, paths: ['/'],
  cameFrom: { kind: 'direct', label: 'Direct / email / app' },
  country: null, city: null, device: null, firstSeen, firstVisit: firstSeen === start.slice(0, 10), actions: [],
});

const win = { start: '2026-10-06', end: '2026-10-16' };

test('returningStats: none old enough for the 7-day check', () => {
  const r = returningStats([
    sess('a', '2026-10-10T08:00:00.000Z', '2026-10-10'),
    sess('b', '2026-10-12T08:00:00.000Z', '2026-09-01'),
    sess('b', '2026-10-13T08:00:00.000Z', '2026-09-01'),
  ], win, '2026-10-16');
  assert.deepEqual(r, { people: 2, visitedBefore: 1, firstVisit: 1, cameBackAnotherDay: 1, d7: { eligible: 0, back: 0 } });
});

test('returningStats: d7 counts a return in days 1-7 only', () => {
  const r = returningStats([
    sess('a', '2026-10-07T08:00:00.000Z', '2026-10-07'),
    sess('a', '2026-10-12T08:00:00.000Z', '2026-10-07'),   // day 5: back
    sess('b', '2026-10-07T09:00:00.000Z', '2026-10-07'),
    sess('b', '2026-10-15T09:00:00.000Z', '2026-10-07'),   // day 8: too late
    sess('c', '2026-10-07T10:00:00.000Z', '2026-10-07'),
    sess('d', '2026-10-14T10:00:00.000Z', '2026-10-14'),   // too recent to judge
  ], win, '2026-10-16');
  assert.deepEqual(r.d7, { eligible: 3, back: 1 });
  assert.equal(r.firstVisit, 4);
  assert.equal(r.cameBackAnotherDay, 2);
});

test('returningStats: two sessions on one day are not a return', () => {
  const r = returningStats([
    sess('a', '2026-10-08T08:00:00.000Z', '2026-10-08'),
    sess('a', '2026-10-08T18:00:00.000Z', '2026-10-08'),
  ], win, '2026-10-16');
  assert.equal(r.cameBackAnotherDay, 0);
  assert.equal(r.people, 1);
});

// ---------------------------------------------------------------- engagement

test('median handles odd, even and empty', () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 10]), 3.5);
});

test('engagementStats: buckets at their edges, over 3 min, pages per visit', () => {
  const durations = [9, 10, 29, 30, 59, 60, 179, 180, 599, 600];
  const sessions = durations.map((d, i) => ({ ...sess(`p${i}`, '2026-10-10T08:00:00.000Z', null), durationS: d, pages: i % 2 ? 2 : 1 }));
  const e = engagementStats(sessions);
  assert.deepEqual(e.buckets.map(b => b.count), [1, 2, 2, 2, 2, 1]);
  assert.deepEqual(e.buckets.map(b => b.label), ['Under 10 s', '10–30 s', '30 s – 1 min', '1–3 min', '3–10 min', 'Over 10 min']);
  assert.equal(e.over3min, 3);
  assert.equal(e.sessions, 10);
  assert.equal(e.pageviews, 15);
  assert.equal(e.pagesPerVisit, 1.5);
  assert.equal(e.medianDurationS, 60); // (59 + 60) / 2 = 59.5 rounds to 60
});

test('engagementStats: no sessions', () => {
  const e = engagementStats([]);
  assert.equal(e.pagesPerVisit, null);
  assert.equal(e.medianDurationS, null);
  assert.equal(e.sessions, 0);
});

// ---------------------------------------------------------------- vitals

test('rateVital uses Google thresholds inclusively', () => {
  assert.equal(rateVital('LCP', 2500), 'good');
  assert.equal(rateVital('LCP', 2501), 'needs-work');
  assert.equal(rateVital('LCP', 4000), 'needs-work');
  assert.equal(rateVital('LCP', 4001), 'poor');
  assert.equal(rateVital('CLS', 0.1), 'good');
  assert.equal(rateVital('CLS', 0.3), 'poor');
});

test('vitalFromCounts: p75 and shares', () => {
  const v = vitalFromCounts('LCP', [[5000, 1], [1000, 5], [3000, 2], [2000, 4]]);
  // 12 samples, 75% = 9: cumulative 5 (1000), 9 (2000)
  assert.equal(v.samples, 12);
  assert.equal(v.p75, 2000);
  assert.equal(v.rating, 'good');
  assert.equal(v.good, 9 / 12);
  assert.equal(v.needsWork, 2 / 12);
  assert.equal(v.poor, 1 / 12);
  assert.equal(v.sampled, false);
});

test('vitalFromCounts: empty gives no p75 or rating', () => {
  const v = vitalFromCounts('INP', []);
  assert.deepEqual(v, { samples: 0, p75: null, good: 0, needsWork: 0, poor: 0, rating: null, sampled: false });
});

test('vitalPairs skips non-numeric labels like (none)', () => {
  const pairs = vitalPairs({
    days: [], hitGroupLimit: false,
    groups: [
      { label: '1200', series: [3], total: 3 },
      { label: '(none)', series: [7], total: 7 },
      { label: '0.05', series: [2], total: 2 },
    ],
  });
  assert.deepEqual(pairs, [[1200, 3], [0.05, 2]]);
});

// ---------------------------------------------------------------- tagged landings

test('parseTaggedUrl reads tags and path; rejects non-URLs', () => {
  assert.deepEqual(
    parseTaggedUrl('https://example.com/digest/x?utm_source=x&utm_medium=social&utm_campaign=W42&utm_content=story-tue&other=1'),
    { source: 'x', medium: 'social', campaign: 'W42', content: 'story-tue', path: '/digest/x' },
  );
  assert.equal(parseTaggedUrl('/relative?utm_source=x'), null);
  assert.equal(parseTaggedUrl('(none)'), null);
});

test('mergeTaggedRows merges same tags, splits social, sorts by visits', () => {
  const people = [
    { label: 'https://example.com/?utm_source=newsletter&utm_medium=email&utm_campaign=W41&fbclid=a', total: 1 },
    { label: 'https://example.com/?utm_source=newsletter&utm_medium=email&utm_campaign=W41&fbclid=b', total: 1 },
    { label: 'https://example.com/?utm_source=x&utm_medium=social&utm_campaign=W42', total: 1 },
  ];
  const visits = [
    { label: 'https://example.com/?utm_source=newsletter&utm_medium=email&utm_campaign=W41&fbclid=a', total: 2 },
    { label: 'https://example.com/?utm_source=newsletter&utm_medium=email&utm_campaign=W41&fbclid=b', total: 1 },
    { label: 'https://example.com/?utm_source=x&utm_medium=social&utm_campaign=W42', total: 1 },
  ];
  const r = mergeTaggedRows(people, visits);
  assert.equal(r.social.length, 1);
  assert.equal(r.social[0]!.source, 'x');
  assert.equal(r.other.length, 1);
  assert.deepEqual([r.other[0]!.people, r.other[0]!.visits], [2, 3]);
});

// ---------------------------------------------------------------- segmentation parsing

test('parseSegmentation: single group label, collapsed total, group limit', () => {
  const r = parseSegmentation({
    xValues: ['2026-10-06T00:00:00', '2026-10-07T00:00:00'],
    series: [[1, 2], [0, 4]],
    seriesLabels: [[0, 'a'], [0, 'b']],
    seriesCollapsed: [[{ value: 2 }], [{ value: 4 }]],
  }, 'page_view', true, 2);
  assert.deepEqual(r.days, ['2026-10-06', '2026-10-07']);
  assert.deepEqual(r.groups.map(g => [g.label, g.total]), [['a', 2], ['b', 4]]);
  assert.equal(r.hitGroupLimit, true);
});

test('parseSegmentation: two group-bys give a joined string label', () => {
  const r = parseSegmentation({ series: [[1]], seriesLabels: ['a; b'] }, 'e', true, 100);
  assert.equal(r.groups[0]!.label, 'a; b');
  assert.equal(r.groups[0]!.total, 1); // no collapsed value: falls back to the sum
  assert.equal(r.hitGroupLimit, false);
});

test('parseSegmentation: ungrouped uses the event name; empty data is empty', () => {
  assert.equal(parseSegmentation({ series: [[3]], seriesLabels: [[0]] }, '_active', false, 100).groups[0]!.label, '_active');
  assert.equal(parseSegmentation({ series: [[3]], seriesLabels: [0] }, '_active', false, 100).groups[0]!.label, '_active');
  assert.deepEqual(parseSegmentation(undefined, 'e', false, 100), { days: [], groups: [], hitGroupLimit: false });
});

// ---------------------------------------------------------------- I/O with mocked fetch

async function withFetch(handler: (url: string) => Response, fn: (calls: string[]) => Promise<void>) {
  const realFetch = globalThis.fetch;
  const savedKey = process.env.AMPLITUDE_SECRET_KEY;
  const calls: string[] = [];
  process.env.AMPLITUDE_SECRET_KEY = 'test-secret';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return handler(String(input));
  }) as typeof fetch;
  try { await fn(calls); } finally {
    globalThis.fetch = realFetch;
    if (savedKey === undefined) delete process.env.AMPLITUDE_SECRET_KEY;
    else process.env.AMPLITUDE_SECRET_KEY = savedKey;
  }
}

test('amplitudeGet repeats array params and throws on non-OK', async () => {
  await withFetch(() => new Response('nope', { status: 400 }), async calls => {
    await assert.rejects(amplitudeGet('/x', { a: ['1', '2'], b: 'c' }), /Amplitude 400: nope/);
    assert.match(calls[0]!, /^https:\/\/analytics\.eu\.amplitude\.com\/api\/x\?a=1&a=2&b=c$/);
  });
});

test('listReplays marks UTC, follows the page token', async () => {
  const page = (token: string | null, id: string) => new Response(JSON.stringify({
    session_replays: [{ replay_id: `d/${id}`, session_id: Number(id), device_id: 'd', amplitude_id: 7, start_time: '2026-10-13T06:31:06.003', end_time: '2026-10-13T06:32:06.003' }],
    next_page_token: token,
  }));
  await withFetch(url => (url.includes('page_token=t1') ? page(null, '2') : page('t1', '1')), async calls => {
    const r = await listReplays('2026-10-13', '2026-10-13');
    assert.deepEqual(r.map(x => x.sessionId), ['1', '2']);
    assert.equal(r[0]!.start, '2026-10-13T06:31:06.003Z');
    assert.equal(r[0]!.amplitudeId, '7');
    assert.equal(calls.length, 2);
  });
});

test('getWebVitals returns zero samples when Amplitude answers 400', async () => {
  await withFetch(() => new Response('Invalid chart definition', { status: 400 }), async () => {
    const v = await getWebVitals({ start: '2026-01-01', end: '2026-03-31' });
    for (const m of ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const) assert.equal(v.metrics[m].samples, 0);
  });
});

// ---------------------------------------------------------------- 429 back-off

test('retryDelayMs: schedule 2/4/8/16/30 s with +/-20% jitter', () => {
  const lo = () => 0, mid = () => 0.5, hi = () => 1;
  const base = [2000, 4000, 8000, 16000, 30000];
  base.forEach((b, i) => {
    assert.equal(retryDelayMs(i, null, mid), b);
    assert.equal(retryDelayMs(i, null, lo), Math.round(b * 0.8));
    assert.equal(retryDelayMs(i, null, hi), Math.round(b * 1.2));
  });
});

test('retryDelayMs: Retry-After seconds wins, capped at 60 s', () => {
  const mid = () => 0.5;
  assert.equal(retryDelayMs(0, '7', mid), 7000);
  assert.equal(retryDelayMs(0, '500', mid), 60000);
  assert.equal(retryDelayMs(0, 'garbage', mid), 2000);
  assert.equal(retryDelayMs(0, '500', () => 1), 60000); // jitter never exceeds the cap
});

test('amplitudeGet retries 429 up to 5 times with growing waits, then succeeds', async () => {
  const waits: number[] = [];
  __setSleepForTests(async ms => { waits.push(ms); });
  try {
    let n = 0;
    await withFetch(() => (++n <= 5 ? new Response('slow down', { status: 429 }) : new Response('{"ok":1}')), async calls => {
      assert.deepEqual(await amplitudeGet('/x'), { ok: 1 });
      assert.equal(calls.length, 6);
    });
    assert.equal(waits.length, 5);
    waits.forEach((w, i) => {
      const b = [2000, 4000, 8000, 16000, 30000][i]!;
      assert.ok(w >= b * 0.8 && w <= b * 1.2, `wait ${i} = ${w}`);
    });
  } finally { __setSleepForTests(); }
});

test('amplitudeGet gives up after 5 retries and honours Retry-After', async () => {
  const waits: number[] = [];
  __setSleepForTests(async ms => { waits.push(ms); });
  try {
    await withFetch(() => new Response('no', { status: 429, headers: { 'Retry-After': '90' } }), async calls => {
      await assert.rejects(amplitudeGet('/x'), /Amplitude 429/);
      assert.equal(calls.length, 6);
    });
    assert.equal(waits.length, 5);
    for (const w of waits) assert.ok(w >= 48000 && w <= 60000, `wait ${w}`); // 60 s cap, jitter only downwards
  } finally { __setSleepForTests(); }
});

test('amplitudeGet frees its slot while sleeping between retries', async () => {
  // Five requests; the first hits a 429 and sleeps until the rest are done. With
  // a 3-slot limit that only completes if the sleeper released its slot.
  let release429!: () => void;
  const gate = new Promise<void>(r => { release429 = r; });
  __setSleepForTests(() => gate);
  try {
    const seen = new Map<string, number>();
    await withFetch(url => {
      const k = new URL(url).searchParams.get('k')!;
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      return k === '0' && n === 1 ? new Response('x', { status: 429 }) : new Response('{}');
    }, async () => {
      const first = amplitudeGet('/x', { k: '0' });
      const others = await Promise.all([1, 2, 3, 4].map(i => amplitudeGet('/x', { k: String(i) })));
      assert.equal(others.length, 4);
      release429();
      await first;
    });
  } finally { __setSleepForTests(); }
});
