/**
 * Does trade-press coverage lead the share price?
 *
 * Pure functions over weekly series, so the result is reproducible and
 * testable. The first run (2026-11-14, 36 weeks, 4 companies) found no lead:
 * a coverage surge says nothing about direction at any lag, and it coincides
 * with the size of the move in the same week (r = 0.32). Read the findings and
 * the caveats in docs/year-review.md before changing a threshold here.
 *
 * Method, in order:
 *  - attention  = the company's share of the panel's articles that week, so a
 *                 busier week (or daily ingestion from 2026-10-05) isn't a surge;
 *  - surprise   = attention minus its own trailing mean, z-scored per company;
 *  - excess     = the company's weekly log return minus the equal-weight basket,
 *                 so a week when all luxury shares fall isn't "signal";
 *  - pooled correlation of surprise[t] with excess[t+lag], and a permutation
 *    test that shuffles each company's surprise series in time.
 */

import type { Backtest, EventGroup, LagStat } from '@/lib/review/types';

export const TRAILING_WEEKS = 8;
/** Below this, weekly counts are mostly 0–2 and a "surge" is one article. */
export const MIN_ARTICLES_PER_WEEK = 2;
export const MAX_LAG = 4;
export const PERMUTATIONS = 2000;
export const LOUD_SHARE = 0.1;

type Series = (number | null)[];

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Deterministic RNG, so the published p-values don't change between builds. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function zscore(xs: Series): Series {
  const v = xs.filter((x): x is number => x != null);
  if (!v.length) return xs.map(() => null);
  const m = mean(v);
  const sd = Math.sqrt(mean(v.map(x => (x - m) ** 2))) || 1;
  return xs.map(x => (x == null ? null : (x - m) / sd));
}

export function correlation(xs: number[], ys: number[]): number {
  if (xs.length < 3) return NaN;
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < xs.length; i++) {
    a += (xs[i]! - mx) * (ys[i]! - my);
    b += (xs[i]! - mx) ** 2;
    c += (ys[i]! - my) ** 2;
  }
  return b && c ? a / Math.sqrt(b * c) : NaN;
}

/** This week's attention against its own trailing mean, z-scored. Null until there is a full trailing window. */
export function surprise(attention: number[], trailing = TRAILING_WEEKS): Series {
  return zscore(attention.map((x, i) => (i < trailing ? null : x - mean(attention.slice(i - trailing, i)))));
}

/** Weekly log returns from closes at each week boundary (length weeks + 1). */
export function logReturns(closes: (number | null)[]): Series {
  return closes.slice(1).map((b, i) => {
    const a = closes[i];
    return a && b ? Math.log(b / a) : null;
  });
}

/** Each company's return minus the equal-weight mean of all companies that week. */
export function excessReturns(returns: Record<string, Series>): Record<string, Series> {
  const keys = Object.keys(returns);
  const weeks = returns[keys[0]!]?.length ?? 0;
  const basket = Array.from({ length: weeks }, (_, i) => {
    const v = keys.map(k => returns[k]![i]).filter((x): x is number => x != null);
    return v.length ? mean(v) : null;
  });
  return Object.fromEntries(keys.map(k => [k, returns[k]!.map((r, i) => (r == null || basket[i] == null ? null : r - basket[i]!))]));
}

function pooled(sur: Record<string, Series>, y: Record<string, Series>, lag: number): { r: number; n: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const k of Object.keys(sur)) {
    const s = sur[k]!, z = zscore(y[k]!);
    for (let i = 0; i < s.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= z.length) continue;
      if (s[i] == null || z[j] == null) continue;
      xs.push(s[i]!); ys.push(z[j]!);
    }
  }
  return { r: correlation(xs, ys), n: xs.length };
}

function shuffled(xs: Series, rand: () => number): Series {
  const s = [...xs];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  return s;
}

/** Pooled correlation at each lag, with a two-sided permutation p-value. */
export function leadLag(sur: Record<string, Series>, y: Record<string, Series>, opts: { maxLag?: number; permutations?: number; seed?: number } = {}): LagStat[] {
  const { maxLag = MAX_LAG, permutations = PERMUTATIONS, seed = 2026 } = opts;
  const rand = mulberry32(seed);
  const out: LagStat[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const obs = pooled(sur, y, lag);
    let atLeast = 0;
    for (let k = 0; k < permutations; k++) {
      const sh = Object.fromEntries(Object.entries(sur).map(([c, s]) => [c, shuffled(s, rand)]));
      if (Math.abs(pooled(sh, y, lag).r) >= Math.abs(obs.r)) atLeast++;
    }
    out.push({ lag, r: Math.round(obs.r * 1000) / 1000, n: obs.n, p: Math.round((atLeast / permutations) * 1000) / 1000 });
  }
  return out;
}

const pct = (x: number) => Math.round(x * 10000) / 100;

/** The loudest company-weeks against the rest: what did the share do that week and after? */
export function eventStudy(sur: Record<string, Series>, excess: Record<string, Series>, share = LOUD_SHARE) {
  const events: { company: string; week: number; z: number }[] = [];
  for (const [company, s] of Object.entries(sur)) {
    // Leave room for the 4 weeks after.
    for (let i = 0; i < s.length - 4; i++) if (s[i] != null) events.push({ company, week: i, z: s[i]! });
  }
  events.sort((a, b) => b.z - a.z);
  const cut = Math.round(events.length * share);
  const forward = (e: typeof events[number], k: number) => {
    let sum = 0;
    for (let j = 1; j <= k; j++) {
      const v = excess[e.company]![e.week + j];
      if (v == null) return null;
      sum += v;
    }
    return sum;
  };
  const group = (set: typeof events): EventGroup => {
    const avg = (f: (e: typeof events[number]) => number | null | undefined) => {
      const v = set.map(f).filter((x): x is number => x != null);
      return v.length ? pct(mean(v)) : 0;
    };
    return {
      n: set.length,
      sameWeek: avg(e => excess[e.company]![e.week]),
      sameWeekAbs: avg(e => { const v = excess[e.company]![e.week]; return v == null ? null : Math.abs(v); }),
      nextWeek: avg(e => forward(e, 1)),
      next4Weeks: avg(e => forward(e, 4)),
    };
  };
  return { loud: group(events.slice(0, cut)), rest: group(events.slice(cut)), ranked: events.slice(0, cut) };
}

export interface BacktestInput {
  /** Company name → weekly article counts. */
  weeklyArticles: Record<string, number[]>;
  /** Panel articles per week (the denominator). */
  panelPerWeek: number[];
  /** Company name → close at each week boundary (length weeks + 1). */
  boundaryCloses: Record<string, (number | null)[]>;
  weekStarts: string[];
}

export function runBacktest(input: BacktestInput): Backtest {
  const weeks = input.panelPerWeek.length;
  const all = Object.keys(input.boundaryCloses);
  // The basket is every listed company; the test only those with enough coverage.
  const excess = excessReturns(Object.fromEntries(all.map(c => [c, logReturns(input.boundaryCloses[c]!)])));
  const tested = all.filter(c => (input.weeklyArticles[c] ?? []).reduce((s, n) => s + n, 0) >= weeks * MIN_ARTICLES_PER_WEEK);

  const sur: Record<string, Series> = {}, ex: Record<string, Series> = {}, abs: Record<string, Series> = {};
  for (const c of tested) {
    sur[c] = surprise(input.weeklyArticles[c]!.map((n, i) => (input.panelPerWeek[i] ? n / input.panelPerWeek[i]! : 0)));
    ex[c] = excess[c]!;
    abs[c] = excess[c]!.map(x => (x == null ? null : Math.abs(x)));
  }
  const ev = eventStudy(sur, ex);
  return {
    companies: tested,
    minArticlesPerWeek: MIN_ARTICLES_PER_WEEK,
    trailingWeeks: TRAILING_WEEKS,
    direction: leadLag(sur, ex, { seed: 2026 }),
    size: leadLag(sur, abs, { seed: 2027 }),
    events: { loud: ev.loud, rest: ev.rest },
    loudest: ev.ranked.map(e => ({
      company: e.company, weekStart: input.weekStarts[e.week]!,
      articles: input.weeklyArticles[e.company]![e.week]!,
      z: Math.round(e.z * 10) / 10,
      excessReturn: pct(ex[e.company]![e.week] ?? 0),
    })),
  };
}
