/**
 * Brand matching and coverage counts for the Markets pages.
 *
 * The false positives here are real: each one was found in the publication's
 * own article data, and the first two broke the old Competitor Watch page.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BRANDS, brandsFor, mentionsBrand, TICKER_COMPANY } from '../markets/brands';
import { computeCoverage, trendOf, TREND_MIN_MENTIONS } from '../markets/coverage';

const brand = (name: string) => {
  const b = BRANDS.find(x => x.name === name);
  if (!b) throw new Error(`no brand ${name}`);
  return b;
};

test('each market tracks twelve brands with unique names', () => {
  for (const m of ['luxury', 'jewellery'] as const) {
    const names = brandsFor(m).map(b => b.name);
    assert.equal(names.length, 12, m);
    assert.equal(new Set(names).size, names.length, `${m} has duplicate names`);
  }
});

test('every ticker has a company name for the price chart', () => {
  for (const b of BRANDS) if (b.ticker) assert(TICKER_COMPANY[b.ticker], `${b.name}: ${b.ticker} has no company name`);
});

test('Signet: its banners match, Jared Kushner and signet rings do not', () => {
  const s = brand('Signet');
  assert(mentionsBrand(s, 'Signet Jewelers reports a modest sales slide'));
  assert(mentionsBrand(s, 'Kay Jewelers launches biggest rebrand in company history'));
  assert(mentionsBrand(s, 'Zales opens new concept store'));
  assert(!mentionsBrand(s, 'US envoys Witkoff and Jared Kushner test new opening in Ukraine talks'));
  assert(!mentionsBrand(s, 'The return of the signet ring: heirloom style for Gen Z'));
});

test('Pandora: the jewellery company, not the Pandora Papers or the music service', () => {
  const p = brand('Pandora');
  assert(mentionsBrand(p, 'Pandora expands manufacturing capacity by 50% with Vietnam facility'));
  assert(!mentionsBrand(p, 'Pandora Papers: offshore wealth of world leaders revealed'));
  assert(!mentionsBrand(p, 'SiriusXM tests AI playlists on Pandora'));
});

test('Hermès: the house, not the parcel carrier', () => {
  const h = brand('Hermès');
  assert(mentionsBrand(h, 'Hermès lifts prices again as Birkin demand holds'));
  assert(mentionsBrand(h, 'Hermes sales rise 12% in the quarter'));
  assert(!mentionsBrand(h, 'Hermes parcel delivery rebrands as Evri'));
});

test('Tiffany: the jeweller, not people or lamps', () => {
  const t = brand('Tiffany & Co.');
  assert(mentionsBrand(t, 'Tiffany & Co. unveils its Bird on a Rock high jewellery'));
  assert(!mentionsBrand(t, 'Tiffany Haddish to host awards show'));
  assert(!mentionsBrand(t, 'Collecting Tiffany lamps: a guide'));
});

// ── Coverage ────────────────────────────────────────────────────────────────

const END = Date.UTC(2026, 8, 28); // 28 Sep 2026
const daysAgo = (d: number) => new Date(END - d * 864e5).toISOString();

test('coverage buckets articles into 12 weeks, oldest first, inside the window only', () => {
  const articles = [
    { title: 'Cartier opens in Milan', published_at: daysAgo(1) },    // last week
    { title: 'Cartier results', published_at: daysAgo(8) },          // week 11
    { title: 'Cartier archive show', published_at: daysAgo(83) },    // week 1
    { title: 'Cartier, long ago', published_at: daysAgo(85) },       // outside
    { title: 'Cartier, tomorrow', published_at: daysAgo(-1) },       // after the window
    { title: 'Nothing relevant', published_at: daysAgo(2) },
  ];
  const [c] = computeCoverage(articles, [brand('Cartier')], END);
  assert.equal(c!.mentions, 3);
  assert.equal(c!.weekly.length, 12);
  assert.equal(c!.weekly[11], 1);
  assert.equal(c!.weekly[10], 1);
  assert.equal(c!.weekly[0], 1);
});

test('a trend is only reported with enough articles and a baseline', () => {
  assert.equal(trendOf([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]), null, 'too few articles');
  assert.equal(trendOf([0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3]), null, 'no prior baseline');
  const steady = trendOf([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2])!;
  assert.equal(steady, 1);
  const rising = trendOf([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2])!;
  assert.equal(rising, 2);
  assert(TREND_MIN_MENTIONS >= 10, 'below ~10 articles a ratio is noise');
});

test('both Markets pages are in the sitemap inventory', async () => {
  const { getIndexableUrls } = await import('../lib/seo/urlInventory');
  const { MARKET_IDS } = await import('../lib/markets/types');
  const urls = (await getIndexableUrls('https://luxury-intel.com')).map(e => e.url);
  for (const m of MARKET_IDS) assert(urls.includes(`https://luxury-intel.com/markets/${m}`), `/markets/${m} missing from the sitemap`);
  assert(!urls.some(u => u.includes('competitor-watch')), 'Competitor Watch redirects now and must not be listed');
});
