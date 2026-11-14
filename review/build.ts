/**
 * Build the year in review data.
 *
 *   articles.json ─┬─ steady panel ─┬─ company coverage ─┬─ companies table
 *                  │                │                    └─ backtest (coverage vs share price)
 *                  └─ luxury press ─── theme labels (cached) ─ themes by month
 *   Yahoo Finance ─── prices (cached)
 *                                    → data/review/<year>.json
 *
 * One-off, run by hand (`npm run review:build`); not part of the weekly run.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { YearReview } from '@/lib/review/types';
import { COMPANIES } from '../markets/attention';
import { runBacktest } from './backtest';
import { boundaryCloses, companyRows, fetchPriceHistory, weeklyCoverage, type PriceHistory } from './companies';
import { fullMonths, inReviewWindow, lastFullWeekEnd, luxuryPressPanel, steadyByWeek, WEEK_MS, WINDOW_START_MS, type ReviewArticle } from './panel';
import { labelThemes, themeSection, type Labels, type Theme } from './themes';

export interface BuildOptions {
  year?: number;
  /** Exclusive end (ms). Default: the Monday after the last full week. */
  endMs?: number;
  /** Use the cached prices and labels only; no network, no model calls. */
  offline?: boolean;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf-8')) as T; } catch { return fallback; }
}

export async function buildYearReview(opts: BuildOptions = {}): Promise<{ review: YearReview; labelled: number; costUsd: number; failedTickers: string[]; unlabelled: number }> {
  const year = opts.year ?? 2026;
  const startMs = WINDOW_START_MS;
  const endMs = opts.endMs ?? lastFullWeekEnd(Date.now());
  const weeks = Math.round((endMs - startMs) / WEEK_MS);
  const dir = path.join(process.cwd(), 'data', 'review', String(year));

  const all = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'articles.json'), 'utf-8')) as ReviewArticle[];
  const windowed = inReviewWindow(all.filter(a => a.source && a.title), startMs, endMs);
  const panel = steadyByWeek(windowed, startMs, weeks);

  // ── prices ────────────────────────────────────────────────────────────────
  const priceFile = path.join(dir, 'prices.json');
  let prices = await readJson<PriceHistory>(priceFile, {});
  let failedTickers: string[] = [];
  if (!opts.offline) {
    const fetched = await fetchPriceHistory(year, endMs, prices);
    prices = fetched.prices; failedTickers = fetched.failed;
    await fs.writeFile(priceFile, JSON.stringify(prices));
  }

  // ── companies + backtest ──────────────────────────────────────────────────
  const companies = companyRows(panel, prices, year, startMs, weeks);
  const coverage = weeklyCoverage(panel, startMs, weeks);
  const perWeek = new Array<number>(weeks).fill(0);
  for (const a of panel) perWeek[Math.floor((new Date(a.published_at || a.ingested_at || 0).getTime() - startMs) / WEEK_MS)]!++;
  const listed = companies.map(c => c.ticker);
  const backtest = runBacktest({
    weeklyArticles: Object.fromEntries(listed.map(t => [COMPANIES[t]!.name, coverage[t]!])),
    panelPerWeek: perWeek,
    boundaryCloses: Object.fromEntries(listed.map(t => [COMPANIES[t]!.name, boundaryCloses(prices[t]!, startMs, weeks)])),
    weekStarts: Array.from({ length: weeks }, (_, i) => new Date(startMs + i * WEEK_MS).toISOString().slice(0, 10)),
  });

  // ── themes ────────────────────────────────────────────────────────────────
  const months = fullMonths(startMs, endMs);
  const press = luxuryPressPanel(windowed, months);
  const themes = (await readJson<{ themes: Theme[] }>(path.join(dir, 'taxonomy.json'), { themes: [] })).themes;
  if (!themes.length) throw new Error(`No taxonomy at data/review/${year}/taxonomy.json`);
  const labelFile = path.join(dir, 'labels.json');
  const labels = await readJson<Labels>(labelFile, {});
  let labelled = 0, costUsd = 0;
  if (!opts.offline) {
    const r = await labelThemes(press, themes, labels, () => fs.writeFile(labelFile, JSON.stringify(labels)));
    labelled = r.labelled; costUsd = r.costUsd;
  }
  const section = themeSection(press, themes, labels, months);

  const review: YearReview = {
    year, builtAtISO: new Date().toISOString(),
    window: { startISO: new Date(startMs).toISOString().slice(0, 10), endISO: new Date(endMs).toISOString().slice(0, 10), weeks },
    archive: { articles: windowed.length, sources: new Set(windowed.map(a => a.source)).size },
    panel: { articles: panel.length, sources: new Set(panel.map(a => a.source)).size },
    companies, backtest, themes: section,
  };
  await fs.writeFile(path.join(process.cwd(), 'data', 'review', `${year}.json`), JSON.stringify(review, null, 1));
  return { review, labelled, costUsd, failedTickers, unlabelled: press.length - section.articles };
}
