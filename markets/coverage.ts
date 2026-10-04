/**
 * Share of voice: how many of the publication's own articles name each brand.
 *
 * Deliberately only the publication's own sources (data/articles.json), so
 * the basis is stable and explainable. Other feeds are used for moves, never
 * for these counts, or the method would change without anyone noticing.
 */

import type { TrackedBrand } from './brands';
import { mentionsBrand } from './brands';

export const COVERAGE_WEEKS = 12;
/**
 * Below this many articles in the window, a trend ratio is noise: 1 article
 * against 0.5 reads as "2×". Established on real data on 2026-10-04 — weekly
 * brand counts are mostly 0–2.
 */
export const TREND_MIN_MENTIONS = 10;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface CoverageArticle {
  title: string;
  snippet?: string;
  published_at?: string;
  ingested_at?: string;
}

export interface BrandCoverage {
  name: string;
  mentions: number;
  weekly: number[];
  trend: number | null;
}

export function articleTime(a: CoverageArticle): number {
  return new Date(a.published_at || a.ingested_at || 0).getTime();
}

export function articleText(a: CoverageArticle): string {
  return `${a.title} ${a.snippet ?? ''}`;
}

/** Articles within the window that ends (exclusively) at `endMs`. */
export function inWindow<T extends CoverageArticle>(articles: T[], endMs: number, weeks = COVERAGE_WEEKS): T[] {
  const start = endMs - weeks * WEEK_MS;
  return articles.filter(a => { const t = articleTime(a); return t >= start && t < endMs; });
}

/**
 * Last 4 weeks' weekly rate divided by the prior 8 weeks' rate.
 * Null when the brand has too few articles, or no prior baseline.
 */
export function trendOf(weekly: number[]): number | null {
  const total = weekly.reduce((s, n) => s + n, 0);
  if (total < TREND_MIN_MENTIONS) return null;
  const recent = weekly.slice(-4).reduce((s, n) => s + n, 0) / 4;
  const prior = weekly.slice(0, -4).reduce((s, n) => s + n, 0) / Math.max(1, weekly.length - 4);
  return prior === 0 ? null : recent / prior;
}

export function computeCoverage(
  articles: CoverageArticle[],
  brands: TrackedBrand[],
  endMs: number,
  weeks = COVERAGE_WEEKS
): BrandCoverage[] {
  const windowed = inWindow(articles, endMs, weeks);
  const start = endMs - weeks * WEEK_MS;

  return brands.map(brand => {
    const weekly = new Array<number>(weeks).fill(0);
    for (const a of windowed) {
      if (!mentionsBrand(brand, articleText(a))) continue;
      const i = Math.floor((articleTime(a) - start) / WEEK_MS);
      if (i >= 0 && i < weeks) weekly[i]!++;
    }
    const mentions = weekly.reduce((s, n) => s + n, 0);
    return { name: brand.name, mentions, weekly, trend: trendOf(weekly) };
  });
}
