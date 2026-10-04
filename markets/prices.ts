/**
 * Share prices for the Markets pages: three months of daily closes per listed
 * company, rebased to 100 so companies in different currencies compare.
 *
 * The old Competitor Watch chart plotted raw prices on one axis, LVMH at €427
 * next to Signet at $104, which compared price levels rather than performance.
 * The page now shows % change only.
 */

import type { MarketPrice } from '@/lib/markets/types';
import { TICKER_COMPANY } from './brands';

export const PRICE_WINDOW_DAYS = 91;
/** ~21 trading days. */
const ONE_MONTH_POINTS = 21;

export interface Close { date: string; close: number }

/** Pure: closes → the stored price record. Exported for tests. */
export function toMarketPrice(ticker: string, closes: Close[], currency: string | null): MarketPrice | null {
  const valid = closes.filter(c => Number.isFinite(c.close) && c.close > 0);
  if (valid.length < 2) return null;
  const first = valid[0]!.close;
  const last = valid.at(-1)!.close;
  const monthAgo = valid[Math.max(0, valid.length - 1 - ONE_MONTH_POINTS)]!.close;
  return {
    ticker,
    company: TICKER_COMPANY[ticker] ?? ticker,
    currency,
    change3m: (last / first - 1) * 100,
    change1m: (last / monthAgo - 1) * 100,
    series: valid.map(c => Math.round((c.close / first) * 1000) / 10),
    windowStart: valid[0]!.date,
    windowEnd: valid.at(-1)!.date,
    stale: false,
  };
}

/**
 * Fetch every ticker. A ticker that fails keeps its previous record, marked
 * stale, so a Yahoo hiccup never blanks the chart; one with no previous
 * record is left out.
 */
export async function fetchPrices(tickers: string[], endDate: Date, previous: MarketPrice[]): Promise<MarketPrice[]> {
  let yf: { chart: (s: string, o: unknown) => Promise<{ quotes: { date: Date | string; close: number | null }[]; meta?: { currency?: string } }> } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('yahoo-finance2') as any;
    const YF = mod.YahooFinance ?? mod.default;
    yf = typeof YF === 'function' ? new YF({ suppressNotices: ['yahooSurvey'] }) : YF;
  } catch {
    console.warn('[Markets] ⚠ yahoo-finance2 unavailable; keeping previous prices');
  }

  const out: MarketPrice[] = [];
  const start = new Date(endDate.getTime() - PRICE_WINDOW_DAYS * 864e5);

  for (const ticker of tickers) {
    let fresh: MarketPrice | null = null;
    if (yf) {
      try {
        const r = await yf.chart(ticker, { period1: start, period2: endDate, interval: '1d' });
        const closes = r.quotes
          .filter(q => q.close != null)
          .map(q => ({ date: new Date(q.date).toISOString().slice(0, 10), close: q.close as number }));
        fresh = toMarketPrice(ticker, closes, r.meta?.currency ?? null);
      } catch (err) {
        console.warn(`[Markets] ⚠ ${ticker}: ${err instanceof Error ? err.message.slice(0, 80) : err}`);
      }
    }
    if (fresh) { out.push(fresh); continue; }
    const old = previous.find(p => p.ticker === ticker);
    if (old) out.push({ ...old, stale: true });
  }
  return out;
}
