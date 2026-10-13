/**
 * Facts the digest pages print: dates, counts, source names, theme chips.
 * Each case is a bug that shipped (see the 2026-10-13 design review).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatDateRange, formatIssueLine, formatPublishedDate } from '../lib/utils/formatDate';
import { formatStatsSecondaryLine, podcastTitle } from '../lib/utils/digestStats';
import { decodeEntities } from '../lib/utils/decodeEntities';
import { displaySourceName } from '../lib/utils/sourceName';
import { stripThemePunctuation } from '../digest/generateThemes';
import type { WeeklyDigest } from '../lib/types';

// 2026-W41 as stored: Copenhagen Mon 5 Oct 00:00 – Sun 11 Oct 23:59, in UTC.
const W41 = { startISO: '2026-10-04T22:00:00.000Z', endISO: '2026-10-11T21:59:59.999Z', builtAtISO: '2026-10-11T14:49:37.824+02:00' };

test('date range is the Copenhagen week, whatever the server timezone', () => {
  assert.equal(formatDateRange(W41.startISO, W41.endISO), 'Oct 5-11th 2026');
  assert.equal(formatIssueLine('2026-W41', W41.startISO), 'Issue W41 · October 2026');
});

test('published dateline uses the build time, not the window start', () => {
  assert.equal(formatPublishedDate(W41), '11 OCTOBER 2026');
  assert.equal(formatPublishedDate({ startISO: W41.startISO }), '05 OCTOBER 2026');
  assert.equal(formatPublishedDate({}), null);
});

test('stats line reconciles total, on-topic and selected counts', () => {
  const top = (n: number) => ({ top: Array.from({ length: n }) });
  const digest = {
    totals: { total: 2216, byTopic: { AIStrategy: 368, EcommerceRetail: 221, LuxuryConsumer: 554, Jewellery: 291 } },
    topics: { AI_and_Strategy: top(7), Ecommerce_Retail_Tech: top(7), Luxury_and_Consumer: top(7), Jewellery_Industry: top(7) },
  } as unknown as WeeklyDigest;
  assert.equal(formatStatsSecondaryLine(digest, 954 / 60), '2,216 articles analysed · 1,434 on-topic · 28 selected · 16 min podcast');
  assert.equal(formatStatsSecondaryLine(digest), '2,216 articles analysed · 1,434 on-topic · 28 selected');
});

test('podcast title carries the real length or none', () => {
  assert.equal(podcastTitle('Weekly Luxury Intelligence', 954), 'Weekly Luxury Intelligence · 16 min');
  assert.equal(podcastTitle('Weekly Luxury Intelligence'), 'Weekly Luxury Intelligence');
});

test('theme chips keep decimals', () => {
  assert.equal(stripThemePunctuation('Anthropic Claude Haiku 5.5.'), 'Anthropic Claude Haiku 5.5');
  assert.equal(stripThemePunctuation('Biohub $1.8 billion push!'), 'Biohub $1.8 billion push');
  assert.equal(stripThemePunctuation('Amazon job cuts, again.'), 'Amazon job cuts again');
});

test('feed titles lose HTML entities', () => {
  assert.equal(decodeEntities('Old Navy Enters Beauty &amp; Erica Choi&#x27;s Guide'), "Old Navy Enters Beauty & Erica Choi's Guide");
  assert.equal(decodeEntities('L&#8217;Oréal &quot;Q3&quot;'), 'L’Oréal "Q3"');
  assert.equal(decodeEntities('AT&T &bogus;'), 'AT&T &bogus;');
});

test('source names hide the ingestion route', () => {
  assert.equal(displaySourceName('Professional Jeweller (via Bing News)'), 'Professional Jeweller');
  assert.equal(displaySourceName('Financial Times - Technology'), 'Financial Times - Technology');
});
