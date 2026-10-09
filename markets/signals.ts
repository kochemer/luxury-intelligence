/**
 * Signals: what the volume of trade-press coverage shows.
 *
 * Counted from every article the panel published, including the ~95% that
 * never make the digest. That stream is what no single outlet sees, and what
 * makes these pages different from a news list.
 *
 * Everything is a share of the panel's articles, never a raw count, so a busier
 * week (or a new feed) doesn't read as a trend. A theme only becomes a signal
 * past explicit thresholds (RULES); below them it's listed as "watching". The
 * thresholds come from running this on real data on 2026-10-09:
 *  - watch blogs diluted every luxury theme (China 1.8× → 1.4×), so they're out;
 *  - "pearls dropped away" was two bursts from one outlet, so falls need breadth;
 *  - snippet-only matches gave weak examples, so headline matches come first.
 */

import { SOURCE_FEEDS, SOURCE_PAGES } from '../ingestion/sources';
import type { CrossSignal, MarketId, SignalExample, SignalRules, ThemeStat } from '@/lib/markets/types';
import { articleText, articleTime, type CoverageArticle } from './coverage';

export type SignalArticle = CoverageArticle & { url: string; source: string };

const WEEK = 7 * 864e5;
const WEEKS = 12;

export const RULES: SignalRules = {
  minArticles: 20, minRecent: 10, minOutlets: 6, rise: 1.5,
  fallPriorMin: 10, fallMinOutlets: 4, fall: 0.4,
};
export const MAX_SIGNALS = 3;

/**
 * Product reviews, not market coverage. Watch blogs are filed under the
 * jewellery hint in the source registry; Dezeen (design) under fashion, where
 * its ~50 articles a week would swamp the panel.
 */
const NOT_MARKET_COVERAGE = /Watch|Fratello|Worn & Wound|SJX|Quill & Pad|Hodinkee|Watchonista|Time and Tide|Dezeen/i;

/** Panels come from the source registry, so new feeds join automatically. */
export function panelSources(market: MarketId): Set<string> {
  const hint = market === 'luxury' ? 'Fashion & Luxury' : 'Jewellery Industry';
  return new Set([...SOURCE_FEEDS, ...SOURCE_PAGES]
    .filter(s => s.categoryHint === hint && !NOT_MARKET_COVERAGE.test(s.name))
    .map(s => s.name));
}

export const THEMES: Record<MarketId, Record<string, RegExp>> = {
  luxury: {
    'China': /\bChina\b|\bChinese\b/i,
    'Tariffs': /tariff/i,
    'Slowdown and weak demand': /slowdown|slump|weak demand|demand cools|downturn|struggl/i,
    'AI': /\bAI\b|artificial intelligence|agentic|ChatGPT|generative/i,
    'Creative director moves': /creative director|steps down|departs|appoint|debut collection|first collection/i,
    'Collaborations': /collab|partners? with|partnership/i,
    'Resale and pre-owned': /resale|pre-owned|second-hand|secondhand/i,
    'Gen Z': /Gen Z|Gen-Z/i,
    'Store openings': /flagship|opens? (a |its )?(new )?(store|boutique)|store opening/i,
    'India': /\bIndia\b|\bIndian\b|Mumbai|Delhi/i,
    'Middle East': /Middle East|Dubai|Saudi|Riyadh|Qatar|Abu Dhabi/i,
    'Price increases': /price (hike|increase|rise)s?|raises? prices/i,
  },
  jewellery: {
    'Lab-grown diamonds': /lab[- ]grown|lab[- ]created|synthetic diamond/i,
    'Natural diamonds': /natural diamond|mined diamond/i,
    'Silver': /\bsilver\b/i,
    'Bridal and engagement': /bridal|engagement|wedding/i,
    'Coloured gems and pearls': /pearl|sapphire|emerald|ruby|coloured gem|colored gem/i,
    'Gold price': /gold price|price of gold|record gold|bullion/i,
    'Tariffs': /tariff/i,
    'Christmas and gifting': /christmas|gifting|gift guide|festive/i,
  },
};

const PROPER = /^(China|India|Middle East|Gen Z|AI)$/;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const sum = (xs: number[]) => xs.reduce((s, n) => s + n, 0);

function example(a: SignalArticle): SignalExample {
  return { title: a.title.trim(), source: a.source, url: a.url, date: iso(articleTime(a)) };
}

/** Headline matches first: a snippet that mentions a theme in passing is weak evidence. */
export function pickExamples(hits: SignalArticle[], re: RegExp, n = 3): SignalExample[] {
  const newest = (x: SignalArticle, y: SignalArticle) => articleTime(y) - articleTime(x);
  const inTitle = hits.filter(a => re.test(a.title)).sort(newest);
  const inSnippet = hits.filter(a => !re.test(a.title)).sort(newest);
  return [...inTitle, ...inSnippet].slice(0, n).map(example);
}

export function judge(s: Pick<ThemeStat, 'total' | 'recent' | 'prior' | 'outlets' | 'ratio'>): ThemeStat['verdict'] {
  if (s.ratio === null) return 'watching';
  if (s.total >= RULES.minArticles && s.recent >= RULES.minRecent && s.outlets >= RULES.minOutlets && s.ratio >= RULES.rise) return 'rising';
  if (s.prior >= RULES.fallPriorMin && s.outlets >= RULES.fallMinOutlets && s.ratio <= RULES.fall) return 'falling';
  return 'watching';
}

export function statementFor(s: ThemeStat, market: MarketId): string | null {
  const press = market === 'luxury' ? 'the luxury trade press' : 'the jewellery trade press';
  const label = PROPER.test(s.name) ? s.name : s.name.toLowerCase();
  if (s.verdict === 'rising') {
    return `Coverage of ${label} is up: ${s.shareRecent}% of ${press}'s articles in the last 4 weeks, against ${s.sharePrior}% in the 8 weeks before, across ${s.outlets} outlets.`;
  }
  if (s.verdict === 'falling') {
    const now = s.recent === 0 ? 'no articles' : `${s.recent} article${s.recent === 1 ? '' : 's'}`;
    return `Talk of ${label} has dropped away: ${now} in the last 4 weeks, after ${s.prior} in the 8 weeks before, across ${s.outlets} outlets.`;
  }
  return null;
}

/** `articles` must already be the 12-week window ending at `endMs`. */
export function computeThemes(articles: SignalArticle[], market: MarketId, endMs: number): { panel: { articles: number; outlets: number }; themes: ThemeStat[] } {
  const sources = panelSources(market);
  const start = endMs - WEEKS * WEEK;
  const panel = articles.filter(a => sources.has(a.source));
  const weekOf = (a: SignalArticle) => Math.floor((articleTime(a) - start) / WEEK);
  const perWeek = Array.from({ length: WEEKS }, (_, i) => panel.filter(a => weekOf(a) === i).length);
  const recentTotal = sum(perWeek.slice(-4)), priorTotal = sum(perWeek.slice(0, -4));

  const themes = Object.entries(THEMES[market]).map(([name, re]): ThemeStat => {
    const hits = panel.filter(a => re.test(articleText(a)));
    const weekly = Array.from({ length: WEEKS }, (_, i) => hits.filter(a => weekOf(a) === i).length);
    const recent = sum(weekly.slice(-4)), prior = sum(weekly.slice(0, -4));
    const shareRecent = recentTotal ? recent / recentTotal : 0;
    const sharePrior = priorTotal ? prior / priorTotal : 0;
    const stat: ThemeStat = {
      name, verdict: 'watching', statement: null, total: hits.length, recent, prior,
      shareRecent: Math.round(shareRecent * 1000) / 10,
      sharePrior: Math.round(sharePrior * 1000) / 10,
      ratio: sharePrior ? Math.round((shareRecent / sharePrior) * 100) / 100 : null,
      outlets: new Set(hits.map(a => a.source)).size,
      weeklyShare: weekly.map((n, i) => (perWeek[i] ? Math.round((n / perWeek[i]!) * 10000) / 100 : 0)),
      examples: pickExamples(hits, re),
    };
    stat.verdict = judge(stat);
    stat.statement = statementFor(stat, market);
    return stat;
  });

  return { panel: { articles: panel.length, outlets: new Set(panel.map(a => a.source)).size }, themes };
}

/** Rising first, then the biggest falls; capped so the page leads with what matters. */
export function selectSignals(themes: ThemeStat[]): { signals: ThemeStat[]; watching: ThemeStat[] } {
  const rising = themes.filter(t => t.verdict === 'rising').sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const falling = themes.filter(t => t.verdict === 'falling').sort((a, b) => b.prior - a.prior);
  const signals = [...rising, ...falling].slice(0, MAX_SIGNALS);
  const shown = new Set(signals.map(s => s.name));
  return {
    signals,
    watching: themes.filter(t => !shown.has(t.name)).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)),
  };
}

const LUXURY_PRESS = () => new Set([...panelSources('luxury'), ...panelSources('jewellery')]);

/**
 * The tech shift reaching luxury: AI shopping agents across all sources, and
 * how few of those articles the luxury trade press wrote. Only this site reads
 * both, which is the point.
 */
export function crossSignal(articles: SignalArticle[], endMs: number): CrossSignal {
  const re = /\bagentic\b|\bAI agents?\b|shopping agents?|AI shopping|Meta'?s Muse|Muse (AI|agent)/i;
  const start = endMs - WEEKS * WEEK;
  const hits = articles.filter(a => re.test(articleText(a)));
  const weekly = Array.from({ length: WEEKS }, (_, i) => hits.filter(a => Math.floor((articleTime(a) - start) / WEEK) === i).length);
  const luxPress = LUXURY_PRESS();
  const inLuxuryPress = hits.filter(a => luxPress.has(a.source)).length;
  const recent = sum(weekly.slice(-4)) / 4, prior = sum(weekly.slice(0, -4)) / 8;
  const direction = recent >= prior ? 'up from' : 'down from';

  // Evidence must be about shopping: "agent" alone pulled in AI-hardware and
  // AI-safety stories.
  const shopping = /shop|commerce|checkout|retail|Meta'?s Muse|\bbuy/i;
  return {
    name: 'Agentic commerce',
    statement: `AI shopping agents are among the biggest tech stories of the quarter: ${Math.round(recent)} articles a week across all sources in the last 4 weeks, ${direction} ${Math.round(prior)}. The luxury trade press wrote ${inLuxuryPress} of the ${hits.length}.`,
    weekly, total: hits.length, outlets: new Set(hits.map(a => a.source)).size, inLuxuryPress,
    examples: pickExamples(hits.filter(a => shopping.test(a.title)), shopping),
  };
}
