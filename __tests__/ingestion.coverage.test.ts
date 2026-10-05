import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapBingNewsUrl, pagedFeedUrl } from '../ingestion/fetchRss';
import { mergeYield, type SourceYield, type SourceYieldReport } from '../ingestion/sourceYield';
import { mergeBufferedArticles, pickYieldReport } from '../scripts/mergeIngestBuffer';
import { classifyTopic } from '../classification/classifyTopics';
import { SOURCE_FEEDS } from '../ingestion/sources';
import type { Article } from '../lib/types';

test('Bing News click-tracking links unwrap to the publisher URL', () => {
  const bing = 'http://www.bing.com/news/apiclick.aspx?ref=FexRss&aid=&tid=abc&url=https%3a%2f%2fwww.businessoffashion.com%2farticles%2fbeauty%2fx%2f&c=1&mkt=en-us';
  assert.equal(unwrapBingNewsUrl(bing), 'https://www.businessoffashion.com/articles/beauty/x/');
  assert.equal(unwrapBingNewsUrl('https://wwd.com/a/'), 'https://wwd.com/a/');
  assert.equal(unwrapBingNewsUrl('not a url'), 'not a url');
});

test('pagedFeedUrl respects an existing query string', () => {
  assert.equal(pagedFeedUrl('https://wwd.com/feed/', 2), 'https://wwd.com/feed/?paged=2');
  assert.equal(pagedFeedUrl('https://x.com/feed?a=1', 3), 'https://x.com/feed?a=1&paged=3');
});

const y = (sourceName: string, n: number, error?: string): SourceYield => ({
  sourceName, type: 'rss', itemsFetched: error ? 0 : 10, itemsParsed: error ? 0 : 10,
  newArticlesAdded: n, duplicates: error ? 0 : 10 - n, yieldPct: n * 10,
  runs: 1, failedRuns: error ? 1 : 0, ...(error ? { lastError: error } : {}),
});

test('mergeYield sums a week of daily runs and keeps failures visible', () => {
  const merged = mergeYield([y('WWD', 8), y('BoF', 0, 'status=403')], [y('WWD', 6), y('BoF', 0, 'status=403'), y('New', 3)]);
  const wwd = merged.find(s => s.sourceName === 'WWD')!;
  assert.equal(wwd.newArticlesAdded, 14);
  assert.equal(wwd.runs, 2);
  assert.equal(wwd.yieldPct, 70);
  const bof = merged.find(s => s.sourceName === 'BoF')!;
  assert.deepEqual([bof.runs, bof.failedRuns, bof.lastError], [2, 2, 'status=403']);
  assert.ok(merged.find(s => s.sourceName === 'New'));
});

const art = (url: string, snippet?: string): Article =>
  ({ id: url, title: url, url, source: 's', published_at: '2026-10-01T00:00:00Z', ingested_at: '2026-10-01T00:00:00Z', snippet } as Article);

test('mergeBufferedArticles adds unseen URLs, fills snippets, never removes', () => {
  const repo = [art('a'), art('b', 'kept')];
  const { merged, added, snippetsFilled } = mergeBufferedArticles(repo, [art('a', 'filled'), art('b', 'other'), art('c')]);
  assert.deepEqual(merged.map(a => a.url), ['a', 'b', 'c']);
  assert.equal(added, 1);
  assert.equal(snippetsFilled, 1);
  assert.equal(merged[0].snippet, 'filled');
  assert.equal(merged[1].snippet, 'kept');
});

test('pickYieldReport only takes the buffer report for the current week', () => {
  const rep = (week: string, runs: number) => ({ week, runs } as SourceYieldReport);
  assert.equal(pickYieldReport(rep('2026-W40', 1), rep('2026-W41', 3), '2026-W41')?.runs, 3);
  assert.equal(pickYieldReport(null, rep('2026-W40', 6), '2026-W41'), null);
  assert.equal(pickYieldReport(rep('2026-W41', 7), rep('2026-W41', 3), '2026-W41'), null);
});

test('new sources route to their intended category by name', () => {
  const route = (source: string, title = 'Company names new chief executive') =>
    classifyTopic({ url: 'https://example.com/x', title, source });
  for (const s of ['JCK - Editorial', 'Rapaport News', 'Hodinkee', 'National Jeweler (via Bing News)', 'Professional Jeweller (via Bing News)', 'WatchPro (via Bing News)']) {
    assert.equal(route(s), 'Jewellery_Industry', s);
  }
  for (const s of ['FashionUnited', 'WWD - Business News', 'CPP-Luxury', 'Moodie Davitt Report', 'The Industry.fashion', 'Business of Fashion (via Bing News)', 'Vogue Business (via Bing News)', 'FashionNetwork (via Bing News)']) {
    assert.equal(route(s), 'Luxury_and_Consumer', s);
  }
});

test('source names are unique (yield and report maps key on them)', () => {
  const names = SOURCE_FEEDS.map(f => f.name);
  assert.equal(new Set(names).size, names.length);
});

test('rerank trim caps one high-volume source and backfills when sources run out', async () => {
  const { takeTopPerSourceCapped } = await import('../digest/rerankArticles');
  const items = [
    ...Array.from({ length: 10 }, (_, i) => ({ source: 'FashionUnited', id: `fu${i}` })),
    { source: 'WWD', id: 'w1' }, { source: 'BoF', id: 'b1' },
  ];
  const top = takeTopPerSourceCapped(items, 6, 4);
  assert.deepEqual(top.map(i => i.id), ['fu0', 'fu1', 'fu2', 'fu3', 'w1', 'b1']);
  const backfilled = takeTopPerSourceCapped(items, 8, 4);
  assert.equal(backfilled.length, 8);
  assert.deepEqual(backfilled.slice(6).map(i => i.id), ['fu4', 'fu5']);
});
