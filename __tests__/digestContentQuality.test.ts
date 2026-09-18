import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDigestContentQuality } from '../pipeline/checks/digestContentQuality';
import type { WeeklyDigest } from '../lib/types';

function makeArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'x',
    title: 'T',
    url: 'https://example.com/' + Math.random(),
    source: 'S',
    published_at: '2026-01-01T00:00:00Z',
    snippet: 'raw rss snippet',
    aiSummary: 'AI-generated summary: a real summary.',
    ...overrides,
  } as never;
}

function makeDigest(opts: {
  perTopic: number;
  summarized: number; // how many of the perTopic*4 have aiSummary
  cover: boolean;
  insight?: boolean; // oneSentenceSummary present (default true)
  themes?: boolean; // keyThemes present (default true)
}): WeeklyDigest {
  const total = opts.perTopic * 4;
  let remaining = opts.summarized;
  const mk = () => {
    const withSummary = remaining > 0;
    if (withSummary) remaining--;
    return makeArticle(withSummary ? {} : { aiSummary: '' });
  };
  const topicArr = () => Array.from({ length: opts.perTopic }, mk);
  return {
    weekLabel: '2026-W99',
    tz: 'Europe/Copenhagen',
    startISO: '2026-01-01T00:00:00Z',
    endISO: '2026-01-07T00:00:00Z',
    ...(opts.cover ? { coverImageUrl: '/weekly-images/2026-W99.png' } : {}),
    ...(opts.insight !== false ? { oneSentenceSummary: 'A sharp one-line reading of the week.' } : {}),
    ...(opts.themes !== false ? { keyThemes: ['AI checkout', 'Luxury resale', 'Lab-grown pricing'] } : {}),
    totals: { total, byTopic: { AIStrategy: 0, EcommerceRetail: 0, LuxuryConsumer: 0, Jewellery: 0 } },
    topics: {
      AI_and_Strategy: { total: opts.perTopic, top: topicArr() },
      Ecommerce_Retail_Tech: { total: opts.perTopic, top: topicArr() },
      Luxury_and_Consumer: { total: opts.perTopic, top: topicArr() },
      Jewellery_Industry: { total: opts.perTopic, top: topicArr() },
    },
  } as WeeklyDigest;
}

test('healthy digest (full summaries + cover) passes', () => {
  const r = checkDigestContentQuality(makeDigest({ perTopic: 7, summarized: 28, cover: true }));
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
  assert.equal(r.summaryCoverage, 1);
});

test('zero AI summaries fails even when snippets exist (the W36 outage)', () => {
  const r = checkDigestContentQuality(makeDigest({ perTopic: 7, summarized: 0, cover: false }));
  assert.equal(r.ok, false);
  // both the summary and cover errors should fire
  assert.ok(r.errors.some(e => /summary coverage too low/i.test(e)));
  assert.ok(r.errors.some(e => /cover image/i.test(e)));
});

test('missing cover alone fails', () => {
  const r = checkDigestContentQuality(makeDigest({ perTopic: 7, summarized: 28, cover: false }));
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.ok(/cover image/i.test(r.errors[0]));
});

test('below-threshold coverage fails; at/above passes', () => {
  const below = checkDigestContentQuality(makeDigest({ perTopic: 7, summarized: 13, cover: true })); // ~46%
  assert.equal(below.ok, false);
  const above = checkDigestContentQuality(makeDigest({ perTopic: 7, summarized: 14, cover: true })); // 50%
  assert.equal(above.ok, true);
});

test('missing weekly insight fails (the W04–W37 null-field regression)', () => {
  const r = checkDigestContentQuality(makeDigest({ perTopic: 7, summarized: 28, cover: true, insight: false }));
  assert.equal(r.ok, false);
  assert.equal(r.hasInsight, false);
  assert.ok(r.errors.some(e => /weekly insight/i.test(e)));
  assert.ok(!r.errors.some(e => /key themes/i.test(e)));
});

test('missing key themes fails', () => {
  const r = checkDigestContentQuality(makeDigest({ perTopic: 7, summarized: 28, cover: true, themes: false }));
  assert.equal(r.ok, false);
  assert.equal(r.themeCount, 0);
  assert.ok(r.errors.some(e => /key themes/i.test(e)));
});

test('whitespace-only insight and blank themes count as missing', () => {
  const d = makeDigest({ perTopic: 7, summarized: 28, cover: true });
  d.oneSentenceSummary = '   ';
  d.keyThemes = ['', '  '];
  const r = checkDigestContentQuality(d);
  assert.equal(r.ok, false);
  assert.equal(r.hasInsight, false);
  assert.equal(r.themeCount, 0);
});

test('requireInsight: false restores the old behaviour', () => {
  const r = checkDigestContentQuality(
    makeDigest({ perTopic: 7, summarized: 28, cover: true, insight: false, themes: false }),
    { requireInsight: false }
  );
  assert.equal(r.ok, true);
});

test('empty digest (no selected articles) fails', () => {
  const r = checkDigestContentQuality(makeDigest({ perTopic: 0, summarized: 0, cover: true }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /empty/i.test(e)));
});
