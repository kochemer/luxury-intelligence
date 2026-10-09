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
  /**
   * Neutral restatement when it passed checks, otherwise the original.
   * Used to merge reports of one event, and shown only when the publisher's
   * headline is unusable: a restatement can change the meaning in ways no
   * check catches ("Virginie Viard departs Chanel" from an interview two
   * years after she left).
   */
  headline: string;
  /** The publisher's headline, exactly as published. */
  originalTitle: string;
  /** What the page shows: the publisher's headline if usable, else the restatement. See displayTitle(). */
  title: string;
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

/** An article shown as evidence for a signal. */
export interface SignalExample {
  title: string;
  source: string;
  url: string;
  date: string; // YYYY-MM-DD
}

/**
 * A theme in the trade press, measured as a share of the panel's articles so a
 * busier week doesn't read as a trend. Only themes that pass the rules
 * (markets/signals.ts) are shown as signals; the rest are "watching".
 */
export interface ThemeStat {
  name: string;
  verdict: 'rising' | 'falling' | 'watching';
  /** Plain-language sentence for a rising or falling theme; null while watching. */
  statement: string | null;
  total: number;
  /** Articles in the last 4 weeks and the 8 before. */
  recent: number;
  prior: number;
  /** % of the panel's articles in each period. */
  shareRecent: number;
  sharePrior: number;
  /** shareRecent ÷ sharePrior; null with no baseline. */
  ratio: number | null;
  outlets: number;
  /** % of the panel's articles per week, oldest → newest, 12 values. */
  weeklyShare: number[];
  examples: SignalExample[];
}

/** A tech-press theme, counted across all sources, and how much of it reached the luxury press. */
export interface CrossSignal {
  name: string;
  statement: string;
  /** Articles per week, oldest → newest, 12 values. */
  weekly: number[];
  total: number;
  outlets: number;
  inLuxuryPress: number;
  examples: SignalExample[];
}

/** Coverage against share-price performance, per listed company. */
export interface AttentionRow {
  ticker: string;
  company: string;
  /** Articles naming the company or any of its brands, 12 weeks, all sources. */
  articles: number;
  change3m: number;
  change1m: number;
}

export interface AttentionCallout {
  company: string;
  /** quiet: big share move, little coverage. loud: most covered, shares falling. */
  kind: 'quiet' | 'loud';
  text: string;
  change3m: number;
}

export interface SignalRules {
  minArticles: number;
  minRecent: number;
  minOutlets: number;
  rise: number;
  fallPriorMin: number;
  fallMinOutlets: number;
  fall: number;
}

export interface MarketData {
  version: 2;
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
  /** The trade-press panel the signals are counted from. */
  panel: { articles: number; outlets: number };
  rules: SignalRules;
  /** Rising first, then the biggest falls; at most three. */
  signals: ThemeStat[];
  watching: ThemeStat[];
  /** Luxury page only. */
  cross: CrossSignal | null;
  attention: AttentionRow[];
  callouts: AttentionCallout[];
}
