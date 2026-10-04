/**
 * Markets pages data model. Written by the build step in markets/, read by
 * app/markets/. Lives in lib/ so the app can import it without pulling in
 * the Node-only build code.
 */

export type MarketId = 'luxury' | 'jewellery';

export const MARKET_IDS: MarketId[] = ['luxury', 'jewellery'];

export const MARKET_LABEL: Record<MarketId, string> = {
  luxury: 'Luxury',
  jewellery: 'Jewellery',
};

/** What kind of thing the company did. Closed set so the page can style it. */
export const MOVE_TYPES = [
  'Results', 'Leadership', 'Collection', 'Retail', 'Pricing', 'Deal',
  'Collaboration', 'Show', 'Campaign', 'Legal', 'Corporate',
] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

export interface MarketMove {
  date: string;          // YYYY-MM-DD
  brand: string;
  type: MoveType;
  /** Major: results, senior hires, deals, main-line launches. Minor: product drops, merch, events. */
  importance: 'major' | 'minor';
  /** How many outlets reported this same event (merged into one move). */
  outlets: number;
  /** Neutral restatement when it passed checks, otherwise the original headline. */
  headline: string;
  originalTitle: string;
  source: string;
  url: string;
}

export interface MarketBrandRow {
  name: string;
  group: string;
  /** Articles naming the brand in the 12-week window (own sources only). */
  mentions: number;
  /** Oldest → newest, 12 values. */
  weekly: number[];
  /** Last 4 weeks' rate ÷ prior 8 weeks' rate; null when too few articles to mean anything. */
  trend: number | null;
  latestMove: MarketMove | null;
  /** Ticker of the listed company (the brand's group where the brand isn't listed itself). */
  ticker: string | null;
  /** Set when the price shown is the group's, e.g. "LVMH" for Dior. */
  priceVia: string | null;
}

export interface MarketPrice {
  ticker: string;
  company: string;
  currency: string | null;
  /** % change across the window and over the last ~month. */
  change3m: number;
  change1m: number;
  /** Closes rebased to 100 at the window start, oldest → newest. */
  series: number[];
  windowStart: string;
  windowEnd: string;
  /** True when this week's fetch failed and these are the previous values. */
  stale: boolean;
}

export interface MarketData {
  version: 1;
  market: MarketId;
  weekLabel: string;
  generatedAtISO: string;
  /** The 12-week coverage window. */
  window: { start: string; end: string };
  articlesScreened: number;
  totalMentions: number;
  /** Two or three validated sentences, or null when generation failed checks. */
  summary: string[] | null;
  brands: MarketBrandRow[];
  moves: MarketMove[];
  prices: MarketPrice[];
}
