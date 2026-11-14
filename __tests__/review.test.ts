/**
 * Year in review: the parts where a silent mistake would publish a wrong number.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlation, excessReturns, leadLag, logReturns, mulberry32, runBacktest, surprise, zscore } from '../review/backtest';
import { boundaryCloses, closeBefore, weeklyCoverage } from '../review/companies';
import { fullMonths, lastFullWeekEnd, steadyByWeek, WEEK_MS, type ReviewArticle } from '../review/panel';
import { themeSection, type Theme } from '../review/themes';

const START = Date.UTC(2026, 2, 2);
const art = (id: string, source: string, date: string, title = 'x'): ReviewArticle => ({ id, source, title, url: `https://e.com/${id}`, published_at: `${date}T12:00:00Z` });

test('lastFullWeekEnd: the Monday on or before now', () => {
  // Saturday 14 Nov 2026 → Monday 9 Nov; a Monday is its own boundary.
  assert.equal(new Date(lastFullWeekEnd(Date.UTC(2026, 10, 14, 15))).toISOString().slice(0, 10), '2026-11-09');
  assert.equal(new Date(lastFullWeekEnd(Date.UTC(2026, 10, 9, 0, 5))).toISOString().slice(0, 10), '2026-11-09');
  assert.equal(new Date(lastFullWeekEnd(Date.UTC(2026, 10, 8, 23))).toISOString().slice(0, 10), '2026-11-02');
});

test('fullMonths: only months that are complete inside the window', () => {
  assert.deepEqual(fullMonths(START, Date.UTC(2026, 10, 9)), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(fullMonths(START, Date.UTC(2026, 11, 7)).at(-1), '2026-11');
  // A window starting mid-month does not count that month.
  assert.equal(fullMonths(Date.UTC(2026, 2, 16), Date.UTC(2026, 5, 1))[0], '2026-04');
});

test('steadyByWeek: drops late joiners and Bing copies', () => {
  const weeks = 10;
  const day = (w: number) => new Date(START + w * WEEK_MS + 864e5).toISOString().slice(0, 10);
  const articles = [
    ...Array.from({ length: weeks }, (_, w) => art(`a${w}`, 'Steady', day(w))),
    ...[7, 8, 9].map(w => art(`b${w}`, 'Late feed', day(w))),
    ...Array.from({ length: weeks }, (_, w) => art(`c${w}`, 'Steady (via Bing News)', day(w))),
  ];
  assert.deepEqual([...new Set(steadyByWeek(articles, START, weeks).map(a => a.source))], ['Steady']);
});

test('closeBefore and boundaryCloses use the last close before each Monday', () => {
  const series = [{ date: '2026-02-27', close: 10 }, { date: '2026-03-02', close: 11 }, { date: '2026-03-06', close: 12 }, { date: '2026-03-09', close: 13 }];
  assert.equal(closeBefore(series, START), 10);
  assert.deepEqual(boundaryCloses(series, START, 1), [10, 12]);
  assert.equal(closeBefore([], START), null);
});

test('weeklyCoverage counts group brands and applies exclusions', () => {
  const panel = [
    art('1', 'S', '2026-03-03', 'Dior names a new chief executive'),
    art('2', 'S', '2026-03-04', 'Tiffany Haddish hosts awards night'),
    art('3', 'S', '2026-03-10', 'Gucci sales fall again'),
  ];
  const c = weeklyCoverage(panel, START, 2);
  assert.deepEqual(c['MC.PA'], [1, 0]);
  assert.deepEqual(c['KER.PA'], [0, 1]);
});

test('zscore, correlation, logReturns, excessReturns', () => {
  assert.deepEqual(zscore([1, null, 3]), [-1, null, 1]);
  assert.ok(Math.abs(correlation([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  assert.deepEqual(logReturns([100, null, 100]), [null, null]);
  const ex = excessReturns({ A: [0.1, 0.0], B: [-0.1, 0.0] });
  assert.ok(Math.abs(ex.A![0]! - 0.1) < 1e-9 && Math.abs(ex.B![0]! + 0.1) < 1e-9 && ex.A![1] === 0);
});

test('surprise is null until a full trailing window exists', () => {
  const s = surprise([1, 1, 1, 5], 3);
  assert.deepEqual(s.slice(0, 3), [null, null, null]);
  assert.notEqual(s[3], null);
});

test('leadLag finds a planted one-week lead, at that lag only, and is deterministic', () => {
  const rand = mulberry32(7);
  const n = 60;
  const mk = () => {
    const x = Array.from({ length: n }, () => rand() - 0.5);
    // y follows x by one week, plus a little noise.
    const y = x.map((_, i) => (i === 0 ? 0 : x[i - 1]!) + (rand() - 0.5) * 0.2);
    return { x, y };
  };
  const a = mk(), b = mk();
  const sur = { A: a.x, B: b.x }, y = { A: a.y, B: b.y };
  const stats = leadLag(sur, y, { maxLag: 2, permutations: 300, seed: 1 });
  const at = (lag: number) => stats.find(s => s.lag === lag)!;
  assert.ok(at(1).r > 0.8 && at(1).p < 0.01, `lag +1: r=${at(1).r} p=${at(1).p}`);
  for (const lag of [-2, -1, 0, 2]) assert.ok(Math.abs(at(lag).r) < 0.35, `lag ${lag}: r=${at(lag).r}`);
  assert.deepEqual(leadLag(sur, y, { maxLag: 2, permutations: 300, seed: 1 }), stats);
});

test('runBacktest tests only companies with enough coverage, but the basket is everyone', () => {
  const weeks = 20;
  const rand = mulberry32(3);
  const closes = () => { let p = 100; return Array.from({ length: weeks + 1 }, () => (p *= 1 + (rand() - 0.5) * 0.06)); };
  const r = runBacktest({
    weeklyArticles: { Loud: Array.from({ length: weeks }, () => 2 + Math.floor(rand() * 6)), Quiet: new Array(weeks).fill(0) },
    panelPerWeek: new Array(weeks).fill(500),
    boundaryCloses: { Loud: closes(), Quiet: closes() },
    weekStarts: Array.from({ length: weeks }, (_, i) => new Date(START + i * WEEK_MS).toISOString().slice(0, 10)),
  });
  assert.deepEqual(r.companies, ['Loud']);
  assert.equal(r.direction.length, 9);
  assert.equal(r.events.loud.n + r.events.rest.n, weeks - 8 - 4);
});

test('themeSection weights outlets equally, so one prolific outlet cannot set the share', () => {
  const themes: Theme[] = [{ name: 'Tariffs', definition: 'd', background: false }];
  const months = ['2026-03', '2026-04'];
  const panel: ReviewArticle[] = [], labels: Record<string, number[]> = {};
  const add = (source: string, month: string, total: number, hits: number) => {
    for (let i = 0; i < total; i++) {
      const id = `${source}-${month}-${i}`;
      panel.push(art(id, source, `${month}-10`));
      labels[id] = i < hits ? [1] : [];
    }
  };
  add('Big', '2026-03', 100, 0); add('Small', '2026-03', 10, 5);   // pooled 4.5%, equal-weight 25%
  add('Big', '2026-04', 100, 50); add('Small', '2026-04', 10, 5);  // equal-weight 50%
  add('Tiny', '2026-04', 2, 2);                                    // under the minimum: ignored
  const s = themeSection(panel, themes, labels, months);
  assert.deepEqual(s.rows[0]!.monthlyShare, [25, 50]);
  assert.equal(s.rows[0]!.ratio, 2);
  assert.equal(s.rows[0]!.articles, 62);
  // An article with no label yet is left out of every count.
  panel.push(art('unlabelled', 'Big', '2026-03-11'));
  assert.equal(themeSection(panel, themes, labels, months).articles, 222);
});
