/**
 * Build both Markets pages' data for the latest digest week.
 *
 *   articles.json ─┬─ coverage (share of voice, own sources only)
 *                  └─ candidates ─┐
 *   Google News ───── candidates ─┴─ classify (cached) ─ moves ─ summary
 *   Yahoo Finance ─── prices
 *                                    → data/markets/{market}.json
 *
 * Non-critical by design: called from the weekly pipeline, but a failure
 * here never blocks a digest.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { MARKET_IDS, type MarketData, type MarketId, type MarketMove } from '@/lib/markets/types';
import { brandsFor, TICKER_COMPANY } from './brands';
import { computeCoverage, inWindow, COVERAGE_WEEKS, type CoverageArticle } from './coverage';
import { ownCandidates, newsCandidates, dedupe } from './candidates';
import { classifyCandidates } from './classifyMoves';
import { writeSummary } from './summary';
import { fetchPrices } from './prices';
import { mergeEvents, latestMoveFor, displayTitle } from './moves';
import { computeThemes, selectSignals, crossSignal, RULES } from './signals';
import { attentionRows, attentionCallouts } from './attention';

const DATA_DIR = path.join(process.cwd(), 'data', 'markets');
const DAY = 864e5;

type SourceArticle = CoverageArticle & { url: string; source: string };

export interface BuildOptions {
  markets?: MarketId[];
  /** Skip Google News (offline, or to test own-source moves alone). */
  skipNews?: boolean;
}

export interface BuildSummary {
  weekLabel: string;
  markets: { market: MarketId; mentions: number; moves: number; summary: boolean; prices: number; stalePrices: number }[];
  llmCalls: number;
}

async function latestDigestWeek(): Promise<{ weekLabel: string; endMs: number }> {
  const dir = path.join(process.cwd(), 'data', 'digests');
  const files = (await fs.readdir(dir)).filter(f => /^\d{4}-W\d{1,2}\.json$/.test(f));
  const sorted = files.sort((a, b) => {
    const [ya, wa] = a.replace('.json', '').split('-W').map(Number);
    const [yb, wb] = b.replace('.json', '').split('-W').map(Number);
    return ya! - yb! || wa! - wb!;
  });
  const latest = sorted.at(-1);
  if (!latest) throw new Error('No digests on disk');
  const digest = JSON.parse(await fs.readFile(path.join(dir, latest), 'utf-8')) as { weekLabel: string; endISO: string };
  // The window runs up to the end of the digest's last day.
  const end = new Date(digest.endISO);
  return { weekLabel: digest.weekLabel, endMs: Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1) };
}

async function readPrevious(market: MarketId): Promise<MarketData | null> {
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${market}.json`), 'utf-8')) as MarketData; } catch { return null; }
}

export async function buildMarkets(options: BuildOptions = {}): Promise<BuildSummary> {
  const { weekLabel, endMs } = await latestDigestWeek();
  const markets = options.markets ?? MARKET_IDS;
  const articles = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'articles.json'), 'utf-8')) as SourceArticle[];
  const windowed = inWindow(articles, endMs, COVERAGE_WEEKS);

  console.log(`[Markets] ${weekLabel}: ${windowed.length} articles in the ${COVERAGE_WEEKS}-week window`);
  const summary: BuildSummary = { weekLabel, markets: [], llmCalls: 0 };

  for (const market of markets) {
    const brands = brandsFor(market);
    const coverage = computeCoverage(windowed, brands, endMs);

    const candidates = dedupe([
      ...ownCandidates(windowed, brands, endMs),
      ...(options.skipNews ? [] : await newsCandidates(brands, endMs)),
    ]);
    const { results, stats } = await classifyCandidates(candidates);
    summary.llmCalls += stats.calls;
    console.log(`[Markets] ${market}: ${candidates.length} candidate(s) — ${stats.cached} cached, ${stats.classified} newly classified`);

    const moves: MarketMove[] = mergeEvents(candidates.flatMap(c => {
      const r = results.get(c.key);
      if (!r?.isMove || !r.type) return [];
      const headline = r.headline ?? c.title;
      const tracked = brands.find(b => b.name === c.brand)!;
      return [{
        date: c.date, brand: c.brand, type: r.type, importance: r.importance ?? 'minor', outlets: 1,
        headline, originalTitle: c.title, title: displayTitle(c.title, headline, tracked), source: c.source, url: c.url,
      }];
    }));

    // "This week" reads the digest week; widened to a fortnight on a quiet week.
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    // Written from major moves, so the sentences lead with what mattered.
    const major = moves.filter(m => m.importance === 'major');
    let recent = major.filter(m => m.date >= iso(endMs - 7 * DAY));
    if (recent.length < 3) recent = major.filter(m => m.date >= iso(endMs - 14 * DAY));
    if (recent.length < 2) recent = moves.filter(m => m.date >= iso(endMs - 7 * DAY));
    const sentences = await writeSummary(market, recent);
    if (sentences) summary.llmCalls++;

    const previous = await readPrevious(market);
    const tickers = [...new Set(brands.map(b => b.ticker).filter((t): t is string => Boolean(t)))];
    const prices = await fetchPrices(tickers, new Date(endMs), previous?.prices ?? []);

    // Signals and attention: counted from the whole stream, not just what the
    // digest published. Pure computation, no API calls.
    const { panel, themes } = computeThemes(windowed, market, endMs);
    const { signals, watching } = selectSignals(themes);
    const attention = attentionRows(windowed, prices);

    const data: MarketData = {
      version: 2,
      market,
      weekLabel,
      generatedAtISO: new Date().toISOString(),
      window: { start: iso(endMs - COVERAGE_WEEKS * 7 * DAY), end: iso(endMs - DAY) },
      articlesScreened: windowed.length,
      totalMentions: coverage.reduce((s, c) => s + c.mentions, 0),
      summary: sentences,
      brands: brands.map(b => {
        const c = coverage.find(x => x.name === b.name)!;
        const own = b.ticker ? TICKER_COMPANY[b.ticker] === b.name : false;
        return {
          name: b.name, group: b.group, mentions: c.mentions, weekly: c.weekly, trend: c.trend,
          latestMove: latestMoveFor(b.name, moves),
          ticker: b.ticker ?? null,
          priceVia: b.ticker && !own ? TICKER_COMPANY[b.ticker] ?? null : null,
        };
      }).sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name)),
      moves,
      prices,
      panel,
      rules: RULES,
      signals,
      watching,
      cross: market === 'luxury' ? crossSignal(windowed, endMs) : null,
      attention,
      callouts: attentionCallouts(attention, market),
    };

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, `${market}.json`), JSON.stringify(data, null, 1), 'utf-8');
    summary.markets.push({
      market, mentions: data.totalMentions, moves: moves.length, summary: sentences !== null,
      prices: prices.length, stalePrices: prices.filter(p => p.stale).length,
    });
  }
  return summary;
}
