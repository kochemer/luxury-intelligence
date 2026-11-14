/**
 * The companies chapter: how much the trade press wrote about each listed
 * group against what its shares did.
 *
 * Coverage uses the group-level patterns from markets/attention.ts (LVMH's
 * coverage is mostly Louis Vuitton, Dior and Tiffany; the share price is the
 * group's). Prices are daily closes kept in data/review/<year>/prices.json so
 * a build without network reproduces the published numbers.
 */

import type { CompanyRow } from '@/lib/review/types';
import { COMPANIES } from '../markets/attention';
import { articleText } from '../markets/coverage';
import { WEEK_MS, weekIndex, type ReviewArticle } from './panel';

export interface Close { date: string; close: number }
export type PriceHistory = Record<string, Close[]>;

export const TICKERS = Object.keys(COMPANIES);

/** Weekly article counts per ticker. `panel` must already be the window. */
export function weeklyCoverage(panel: ReviewArticle[], startMs: number, weeks: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [ticker, c] of Object.entries(COMPANIES)) {
    const weekly = new Array<number>(weeks).fill(0);
    for (const a of panel) {
      const text = articleText(a);
      if (!c.re.test(text) || (c.exclude && c.exclude.test(text))) continue;
      const i = weekIndex(a, startMs);
      if (i >= 0 && i < weeks) weekly[i]!++;
    }
    out[ticker] = weekly;
  }
  return out;
}

/** The last close strictly before `ms` (a week boundary, Monday 00:00 UTC). */
export function closeBefore(series: Close[], ms: number): number | null {
  let v: number | null = null;
  for (const p of series) {
    if (new Date(p.date).getTime() < ms) v = p.close; else break;
  }
  return v;
}

/** Closes at each week boundary: length weeks + 1. */
export function boundaryCloses(series: Close[], startMs: number, weeks: number): (number | null)[] {
  return Array.from({ length: weeks + 1 }, (_, i) => closeBefore(series, startMs + i * WEEK_MS));
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function companyRows(panel: ReviewArticle[], prices: PriceHistory, year: number, startMs: number, weeks: number): CompanyRow[] {
  const coverage = weeklyCoverage(panel, startMs, weeks);
  const endMs = startMs + weeks * WEEK_MS;
  return TICKERS.flatMap((ticker): CompanyRow[] => {
    const series = (prices[ticker] ?? []).filter(p => p.date >= `${year}-01-01` && Number.isFinite(p.close) && p.close > 0);
    const first = series[0]?.close, last = closeBefore(series, endMs), atStart = closeBefore(series, startMs);
    if (!first || !last || !atStart) return [];
    const articles = coverage[ticker]!.reduce((s, n) => s + n, 0);
    // One point per week from the first week of the year, so the film can draw the whole year.
    const yearStart = Date.UTC(year, 0, 1);
    const points = Math.floor((endMs - yearStart) / WEEK_MS);
    const weeklySeries = Array.from({ length: points }, (_, i) => closeBefore(series, endMs - (points - 1 - i) * WEEK_MS))
      .filter((c): c is number => c != null).map(c => round1((c / first) * 100));
    return [{
      ticker, company: COMPANIES[ticker]!.name, articles,
      shareOfCoverage: panel.length ? Math.round((articles / panel.length) * 10000) / 100 : 0,
      changeYtd: round1((last / first - 1) * 100),
      changeWindow: round1((last / atStart - 1) * 100),
      series: weeklySeries,
      weeklyArticles: coverage[ticker]!,
    }];
  }).sort((a, b) => b.articles - a.articles);
}

/**
 * Daily closes from Yahoo Finance for the year so far. A ticker that fails
 * keeps its previous history, so a Yahoo hiccup never drops a company.
 */
export async function fetchPriceHistory(year: number, endMs: number, previous: PriceHistory): Promise<{ prices: PriceHistory; failed: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import('yahoo-finance2') as any;
  const YF = mod.YahooFinance ?? mod.default;
  const yf = typeof YF === 'function' ? new YF({ suppressNotices: ['yahooSurvey'] }) : YF;
  const prices: PriceHistory = {}, failed: string[] = [];
  for (const ticker of TICKERS) {
    try {
      const r = await yf.chart(ticker, { period1: new Date(Date.UTC(year - 1, 11, 20)), period2: new Date(endMs), interval: '1d' });
      prices[ticker] = (r.quotes as { date: Date | string; close: number | null }[])
        .filter(q => q.close != null)
        .map(q => ({ date: new Date(q.date).toISOString().slice(0, 10), close: q.close as number }));
    } catch {
      failed.push(ticker);
      if (previous[ticker]) prices[ticker] = previous[ticker]!;
    }
  }
  return { prices, failed };
}
