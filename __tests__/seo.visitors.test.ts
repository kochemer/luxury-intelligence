/**
 * Visitors (Amplitude): source classification, windows, the bot filter's
 * arithmetic, and the email section.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyReferrer, weeklyWindows, getVisitorSummary, HUMAN_FILTERS } from '../seo/analytics/visitors';
import { buildWeeklyEmailHtml, buildWeeklyEmailText, buildWeeklySubject, visitorsNote } from '../seo/report/weeklyEmail';
import type { SeoReport, VisitorSummary } from '../seo/types';

test('referring domains map to plain channels', () => {
  assert.equal(classifyReferrer('www.google.com'), 'Search');
  assert.equal(classifyReferrer('com.google.android.googlequicksearchbox'), 'Search');
  assert.equal(classifyReferrer('www.mamma.com'), 'Search');
  assert.equal(classifyReferrer('chatgpt.com'), 'AI assistants');
  assert.equal(classifyReferrer('www.perplexity.ai'), 'AI assistants');
  // Gemini is on a google.com subdomain, so AI must win over search.
  assert.equal(classifyReferrer('gemini.google.com'), 'AI assistants');
  assert.equal(classifyReferrer('www.linkedin.com'), 'LinkedIn');
  assert.equal(classifyReferrer('engage.cloud.microsoft'), 'Teams / Outlook');
  assert.equal(classifyReferrer('teams.public.onecdn.static.microsoft'), 'Teams / Outlook');
  assert.equal(classifyReferrer('www.reddit.com'), 'Other social');
  assert.equal(classifyReferrer('somebrand.com'), 'Other sites');
  for (const none of ['(none)', 'EMPTY', '', null, undefined]) {
    assert.equal(classifyReferrer(none), 'Direct / email');
  }
});

test('windows are the last 7 complete days and the 7 before, never today', () => {
  const { current, previous } = weeklyWindows(new Date('2026-10-04T13:00:00Z'));
  assert.equal(current.end.toISOString().slice(0, 10), '2026-10-03');
  assert.equal(current.start.toISOString().slice(0, 10), '2026-09-27');
  assert.equal(previous.end.toISOString().slice(0, 10), '2026-09-26');
  assert.equal(previous.start.toISOString().slice(0, 10), '2026-09-20');
});

test('the bot filter targets the signatures actually seen in the data', () => {
  const os = HUMAN_FILTERS.find(f => f.subprop_key === 'os')!;
  for (const marker of ['spider', 'Spider', 'bot', 'Bot', 'Headless', 'indexer']) {
    assert.ok(os.subprop_value.includes(marker), `missing ${marker}`);
  }
  assert.ok(HUMAN_FILTERS.some(f => f.subprop_key === 'device_type' && f.subprop_value.includes('Linux')));
});

async function withSecret<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const saved = process.env.AMPLITUDE_SECRET_KEY;
  if (value === undefined) delete process.env.AMPLITUDE_SECRET_KEY;
  else process.env.AMPLITUDE_SECRET_KEY = value;
  const realFetch = globalThis.fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    if (saved === undefined) delete process.env.AMPLITUDE_SECRET_KEY;
    else process.env.AMPLITUDE_SECRET_KEY = saved;
  }
}

test('without a secret key, no request is made and the section is omitted', async () => {
  await withSecret(undefined, async () => {
    let called = false;
    globalThis.fetch = (async () => { called = true; throw new Error('should not fetch'); }) as typeof fetch;
    assert.equal(await getVisitorSummary(), null);
    assert.equal(called, false);
  });
});

test('summary uses deduplicated totals, subtracts bots, and groups referrers into channels', async () => {
  await withSecret('test-secret', async () => {
    const urls: string[] = [];
    const responses = [
      // people (filtered), this week: daily uniques sum to 10, collapsed is 8
      { series: [[3, 4, 3]], seriesCollapsed: [[{ value: 8 }]], seriesLabels: [0] },
      // people, previous week
      { series: [[7]], seriesCollapsed: [[{ value: 7 }]], seriesLabels: [0] },
      // everyone, this week
      { series: [[33]], seriesCollapsed: [[{ value: 33 }]], seriesLabels: [0] },
      // by referrer
      {
        series: [[4], [2], [2], [1], [0]],
        seriesCollapsed: [[{ value: 4 }], [{ value: 2 }], [{ value: 2 }], [{ value: 1 }], [{ value: 0 }]],
        seriesLabels: [[0, '(none)'], [0, 'engage.cloud.microsoft'], [0, 'teams.public.onecdn.static.microsoft'], [0, 'www.google.com'], [0, 'chatgpt.com']],
      },
    ];
    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ data: responses.shift() }), { status: 200 });
    }) as typeof fetch;

    const v = await getVisitorSummary(new Date('2026-10-04T13:00:00Z'));
    assert.ok(v);
    assert.equal(v.people, 8, 'collapsed unique count, not the sum of daily uniques');
    assert.equal(v.previousPeople, 7);
    assert.equal(v.botsExcluded, 25);
    assert.deepEqual(v.channels, [
      { channel: 'Direct / email', visitors: 4 },
      { channel: 'Teams / Outlook', visitors: 4 },
      { channel: 'Search', visitors: 1 },
    ]);
    assert.ok(!v.referrers.some(r => r.domain === '(none)'), 'direct is not a referring site');
    assert.ok(!v.referrers.some(r => r.visitors === 0), 'zero rows dropped');
    assert.ok(urls.every(u => u.startsWith('https://analytics.eu.amplitude.com/api/2/')), 'EU region by default');
  });
});

test('an API error is thrown, so the weekly run can log it and carry on', async () => {
  await withSecret('test-secret', async () => {
    globalThis.fetch = (async () => new Response('{"error":"Invalid API key"}', { status: 401 })) as typeof fetch;
    await assert.rejects(getVisitorSummary(), /Amplitude 401/);
  });
});

const VISITORS: VisitorSummary = {
  window: { start: '2026-09-27', end: '2026-10-03' },
  people: 8, previousPeople: 7, botsExcluded: 25,
  channels: [{ channel: 'Teams / Outlook', visitors: 4 }, { channel: 'Search', visitors: 1 }],
  referrers: [{ domain: '<script>evil.example</script>', visitors: 1 }],
};

function report(visitors?: VisitorSummary): SeoReport {
  return {
    version: 1,
    week: '2026-W40',
    generatedAtISO: '2026-10-04T08:00:00.000Z',
    siteUrl: 'https://luxury-intel.com',
    inputs: {
      gscAvailable: true, liveChecked: true, urlsAudited: 47, urlsMetaChecked: 39, urlsFetched: 47, llmUsed: false,
      coveredCategories: ['technical'],
      ...(visitors ? { visitors } : {}),
    },
    score: { overall: 90, byCategory: { technical: 100, onpage: null, 'structured-data': null, indexing: null, performance: null, opportunity: null } },
    findings: [],
    delta: { newFindings: [], resolvedFindings: [], persistingFindings: [], scoreChange: 0 },
  };
}

test('the email shows visitors with the week-on-week change and bots filtered, escaping referrers', () => {
  const html = buildWeeklyEmailHtml({ report: report(VISITORS) });
  assert.match(html, /Visitors/);
  assert.match(html, /8 people/);
  assert.match(html, /\+1 vs prior week · 25 bots filtered out/);
  assert.match(html, /Teams \/ Outlook — 4/);
  assert.ok(!html.includes('<script>evil'), 'referring domains are escaped');
  assert.match(buildWeeklyEmailText({ report: report(VISITORS) }), /VISITORS \(2026-09-27 to 2026-10-03\)/);
  assert.match(buildWeeklySubject(report(VISITORS)), /· 8 visitors/);
});

test('without visitor data the email says so and the subject omits it', () => {
  assert.match(buildWeeklyEmailText({ report: report() }), /Visitors:\s+not available this week/);
  assert.ok(!buildWeeklySubject(report()).includes('visitor'));
  assert.ok(!buildWeeklyEmailHtml({ report: report() }).includes('Where they came from'));
});

test('no change reads as "same as", and no percentages at single digits', () => {
  assert.match(visitorsNote({ ...VISITORS, previousPeople: 8 }), /^same as prior week/);
  assert.ok(!visitorsNote(VISITORS).includes('%'));
});
