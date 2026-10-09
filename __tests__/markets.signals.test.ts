/**
 * Signals and attention for the Markets pages. Each rule is pinned to the
 * real-data case that motivated it (2026-10-09).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { judge, statementFor, pickExamples, panelSources, computeThemes, selectSignals, RULES } from '../markets/signals';
import { attentionCallouts } from '../markets/attention';
import type { AttentionRow, ThemeStat } from '../lib/markets/types';

const stat = (o: Partial<ThemeStat>): ThemeStat => ({
  name: 'X', verdict: 'watching', statement: null, total: 0, recent: 0, prior: 0, shareRecent: 0, sharePrior: 0,
  ratio: null, outlets: 0, weeklyShare: [], examples: [], ...o,
});

test('China, as measured on real data, is a rising signal', () => {
  const s = stat({ name: 'China', total: 54, recent: 26, prior: 28, outlets: 10, ratio: 1.77, shareRecent: 4.2, sharePrior: 2.4 });
  assert.equal(judge(s), 'rising');
  s.verdict = 'rising';
  assert.equal(statementFor(s, 'luxury'),
    "Coverage of China is up: 4.2% of the luxury trade press's articles in the last 4 weeks, against 2.4% in the 8 weeks before, across 10 outlets.");
});

test('a big ratio on few articles is not a signal', () => {
  // Natural diamonds: 4.4× on 6 articles.
  assert.equal(judge(stat({ total: 6, recent: 4, prior: 2, outlets: 3, ratio: 4.39 })), 'watching');
});

test('a fall needs breadth: two bursts from one outlet are not a trend', () => {
  // Coloured gems and pearls: 20 articles, then none, from 3 outlets.
  assert.equal(judge(stat({ total: 20, recent: 0, prior: 20, outlets: 3, ratio: 0 })), 'watching');
  // Tariffs: 13 then none, from 6 outlets.
  const tariffs = stat({ name: 'Tariffs', total: 13, recent: 0, prior: 13, outlets: 6, ratio: 0, verdict: 'falling' });
  assert.equal(judge(tariffs), 'falling');
  assert.equal(statementFor(tariffs, 'luxury'), 'Talk of tariffs has dropped away: no articles in the last 4 weeks, after 13 in the 8 weeks before, across 6 outlets.');
});

test('no baseline means no verdict', () => {
  assert.equal(judge(stat({ total: 30, recent: 30, prior: 0, outlets: 9, ratio: null })), 'watching');
});

test('at most three signals, rising first', () => {
  const themes = [
    stat({ name: 'A', verdict: 'falling', prior: 12 }), stat({ name: 'B', verdict: 'rising', ratio: 1.6 }),
    stat({ name: 'C', verdict: 'falling', prior: 20 }), stat({ name: 'D', verdict: 'falling', prior: 15 }),
    stat({ name: 'E', verdict: 'watching', ratio: 1.2 }),
  ];
  const { signals, watching } = selectSignals(themes);
  assert.deepEqual(signals.map(s => s.name), ['B', 'C', 'D']);
  assert.deepEqual(watching.map(s => s.name).sort(), ['A', 'E']);
});

test('examples prefer headline matches over passing mentions', () => {
  const art = (title: string, snippet: string, d: string) => ({ title, snippet, url: title, source: 's', published_at: `2026-09-${d}T10:00:00Z` });
  const ex = pickExamples([
    art('Fashion week roundup', 'with a nod to India', '30'),
    art('Kering brings award to India', '', '08'),
  ], /\bIndia\b/i);
  assert.equal(ex[0]!.title, 'Kering brings award to India', 'the headline match leads, even though older');
});

test('panels come from the source registry and leave out reviews and design', () => {
  const lux = panelSources('luxury'), jew = panelSources('jewellery');
  assert(lux.has('WWD - Women\'s Wear Daily') && lux.has('Jing Daily'));
  assert(!lux.has('Dezeen'), 'a design magazine would swamp the luxury panel');
  assert(jew.has('Jeweller - Business News'));
  assert(![...jew].some(s => /Watch|Fratello|Hodinkee/.test(s)), 'watch blogs are product reviews, not market coverage');
});

test('shares, not counts: a busier week does not create a trend', () => {
  // Same share in both periods, double the volume recently → ratio 1.
  const end = Date.UTC(2026, 9, 5), week = 7 * 864e5;
  const articles = [];
  for (let w = 0; w < 12; w++) {
    const n = w >= 8 ? 20 : 10;
    for (let i = 0; i < n; i++) {
      articles.push({ title: i < n / 10 ? 'China demand' : 'Other news', url: `u${w}-${i}`, source: 'Jing Daily',
        published_at: new Date(end - (12 - w) * week + 864e5).toISOString() });
    }
  }
  const { themes } = computeThemes(articles, 'luxury', end);
  const china = themes.find(t => t.name === 'China')!;
  assert.equal(china.ratio, 1);
  assert.equal(china.verdict, 'watching');
});

// ── Attention ───────────────────────────────────────────────────────────────

const row = (o: Partial<AttentionRow>): AttentionRow => ({ ticker: 'T', company: 'C', articles: 0, change3m: 0, change1m: 0, ...o });

test('a big share move with almost no coverage is called out', () => {
  const c = attentionCallouts([
    row({ company: 'Signet', articles: 5, change3m: 22.9 }),
    row({ company: 'Brilliant Earth', articles: 0, change3m: 23 }),
    row({ company: 'Pandora', articles: 4, change3m: 3.8 }),
  ], 'jewellery');
  assert.deepEqual(c.map(x => x.text), [
    'Signet shares rose 23% in three months, with just 5 articles about it in 12 weeks.',
    'Brilliant Earth shares rose 23% in three months, with no articles about it in 12 weeks.',
  ]);
});

test('the most-covered group falling is called out on the luxury page only', () => {
  const rows = [row({ company: 'LVMH', articles: 125, change3m: -23 }), row({ company: 'Prada', articles: 29, change3m: -6.3 })];
  assert.equal(attentionCallouts(rows, 'luxury')[0]!.kind, 'loud');
  assert.equal(attentionCallouts(rows, 'jewellery').length, 0, 'LVMH is covered for fashion, not jewellery');
  assert(RULES.minOutlets >= 6);
});
