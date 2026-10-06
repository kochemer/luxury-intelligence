/**
 * Cookieless visit counter: what gets stored, what counts as a bot, and how
 * the weekly email describes counter numbers.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isBotUserAgent, deviceFromUserAgent, referrerDomain, cleanPath, lastDays, daysEndingToday, eachDay, deviceFromAmplitude, countryName, cleanArticleUrl } from '../lib/analytics/visits';
import { visitorsNote, visitorsSourceNote } from '../seo/report/weeklyEmail';
import type { VisitorSummary } from '../seo/types';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

test('real browsers are people', () => {
  for (const ua of [IPHONE, MAC, WIN, ANDROID, IPAD]) assert.equal(isBotUserAgent(ua), false, ua);
});

test('crawlers, headless and data-centre Linux are bots', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko; compatible; 360Spider)',
    'curl/8.4.0',
    '',
    null,
  ]) assert.equal(isBotUserAgent(ua), true, String(ua));
});

test('device class', () => {
  assert.equal(deviceFromUserAgent(IPHONE), 'mobile');
  assert.equal(deviceFromUserAgent(ANDROID), 'mobile');
  assert.equal(deviceFromUserAgent(IPAD), 'tablet');
  assert.equal(deviceFromUserAgent(MAC), 'desktop');
});

test('only the referring domain is kept, never the full URL or a self-referral', () => {
  assert.equal(referrerDomain('https://www.linkedin.com/feed/update/urn:li:activity:123?token=secret', 'luxury-intel.com'), 'linkedin.com');
  assert.equal(referrerDomain('https://luxury-intel.com/archive', 'luxury-intel.com'), null);
  assert.equal(referrerDomain('https://www.luxury-intel.com/', 'luxury-intel.com'), null);
  assert.equal(referrerDomain('', 'luxury-intel.com'), null);
  assert.equal(referrerDomain('not a url', 'luxury-intel.com'), null);
  assert.equal(referrerDomain(42, 'luxury-intel.com'), null);
});

test('paths lose query strings; API and the private analytics page are not counted', () => {
  assert.equal(cleanPath('/digest/x?utm_source=li&email=a@b.c#top'), '/digest/x');
  assert.equal(cleanPath('/'), '/');
  assert.equal(cleanPath('/archive/'), '/archive');
  assert.equal(cleanPath('/analytics'), null);
  assert.equal(cleanPath('/api/hit'), null);
  assert.equal(cleanPath('https://evil.example/'), null);
  assert.equal(cleanPath(undefined), null);
  assert.equal(cleanPath('/' + 'a'.repeat(500))!.length, 200);
});

test('lastDays: complete UTC days ending yesterday', () => {
  const { current, previous } = lastDays(7, new Date('2026-10-11T08:00:00Z'));
  assert.deepEqual(current, { start: '2026-10-04', end: '2026-10-10' });
  assert.deepEqual(previous, { start: '2026-09-27', end: '2026-10-03' });
});

const BASE: VisitorSummary = {
  source: 'counter',
  window: { start: '2026-10-04', end: '2026-10-10' },
  people: 12, previousPeople: null, botsExcluded: 3, channels: [], referrers: [],
};

test('email: counter numbers explain themselves, including a partial first week', () => {
  assert.equal(visitorsNote(BASE), 'no prior week to compare · 3 bots filtered out');
  assert.match(visitorsSourceNote({ ...BASE, countingSince: '2026-10-05' }), /cookieless counter.*Counting began 2026-10-05/);
  assert.match(visitorsSourceNote({ ...BASE, source: undefined }), /only sees visitors who accepted cookies/);
  assert.equal(visitorsNote({ ...BASE, previousPeople: 10 }), '+2 vs prior week · 3 bots filtered out');
});

test('history from Amplitude maps onto the counter device classes and country names', () => {
  assert.equal(deviceFromAmplitude('Apple iPhone'), 'mobile');
  assert.equal(deviceFromAmplitude('Samsung Galaxy S23'), 'mobile');
  assert.equal(deviceFromAmplitude('Apple iPad'), 'tablet');
  assert.equal(deviceFromAmplitude('Windows'), 'desktop');
  assert.equal(deviceFromAmplitude('Mac'), 'desktop');
  assert.equal(countryName('DK'), 'Denmark');
  assert.equal(countryName('??'), 'Unknown');
  assert.equal(countryName('Denmark'), 'Denmark', 'Amplitude names pass through');
});

test('live ranges end today; every day in a range is listed', () => {
  const { current, previous } = daysEndingToday(7, new Date('2026-10-06T09:00:00Z'));
  assert.deepEqual(current, { start: '2026-09-30', end: '2026-10-06' });
  assert.deepEqual(previous, { start: '2026-09-23', end: '2026-09-29' });
  assert.equal(eachDay(current).length, 7);
  assert.equal(eachDay(current)[6], '2026-10-06');
});

test('article clicks: only outbound article links count, without fragments', () => {
  assert.equal(cleanArticleUrl('https://www.retaildive.com/news/x/123/#comments'), 'https://www.retaildive.com/news/x/123/');
  assert.equal(cleanArticleUrl('https://luxury-intel.com/archive'), null);
  assert.equal(cleanArticleUrl('https://luxury-intelligence.vercel.app/'), null);
  assert.equal(cleanArticleUrl('http://localhost:3000/'), null);
  assert.equal(cleanArticleUrl('javascript:alert(1)'), null);
  assert.equal(cleanArticleUrl('not a url'), null);
  assert.equal(cleanArticleUrl(42), null);
  assert.equal(cleanArticleUrl('https://x.com/' + 'a'.repeat(700)), null);
});
