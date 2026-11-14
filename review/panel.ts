/**
 * Which articles the year in review counts.
 *
 * The archive is uneven: most feeds were connected in March 2026, and daily
 * ingestion (2026-10-05) tripled October's raw counts because it keeps every
 * item where the weekly run kept only what was still in the feed. So:
 *  - the window starts on Monday 2 March 2026;
 *  - only steady sources count (present in most weeks), so a feed that joined
 *    late doesn't read as a trend;
 *  - everything downstream is a share of the panel, never a raw count.
 */

import { SOURCE_FEEDS, SOURCE_PAGES } from '../ingestion/sources';
import { articleTime, type CoverageArticle } from '../markets/coverage';

export type ReviewArticle = CoverageArticle & { id: string; url: string; source: string };

export const WEEK_MS = 7 * 864e5;
/** Monday 2 March 2026: the first week most feeds exist. */
export const WINDOW_START_MS = Date.UTC(2026, 2, 2);
/** A source is steady if it published in at least this share of the weeks (or months). */
export const STEADY_SHARE = 0.8;
/** Bing News copies of a feed we already read directly. */
const DUPLICATE_SOURCE = /via Bing/i;
/** Product reviews and design, not market coverage (same list as markets/signals.ts). */
const NOT_MARKET_COVERAGE = /Watch|Fratello|Worn & Wound|SJX|Quill & Pad|Hodinkee|Watchonista|Time and Tide|Dezeen/i;

/** The Monday after the last full Mon–Sun week before `now` (UTC). */
export function lastFullWeekEnd(now: number): number {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return midnight - daysSinceMonday * 864e5;
}

export function inReviewWindow<T extends CoverageArticle>(articles: T[], startMs: number, endMs: number): T[] {
  return articles.filter(a => { const t = articleTime(a); return t >= startMs && t < endMs; });
}

export const weekIndex = (a: CoverageArticle, startMs: number) => Math.floor((articleTime(a) - startMs) / WEEK_MS);
export const monthOf = (a: CoverageArticle) => new Date(articleTime(a)).toISOString().slice(0, 7);

/** Full calendar months inside the window, as YYYY-MM. */
export function fullMonths(startMs: number, endMs: number): string[] {
  const out: string[] = [];
  const s = new Date(startMs);
  // A window that starts in the first week of a month counts that month as full.
  const y = s.getUTCFullYear();
  let m = s.getUTCMonth() + (s.getUTCDate() > 7 ? 1 : 0);
  while (Date.UTC(y, m + 1, 1) <= endMs) {
    out.push(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7));
    m++;
  }
  return out;
}

/** Sources present in at least STEADY_SHARE of the weeks. `articles` must already be the window. */
export function steadyByWeek<T extends ReviewArticle>(articles: T[], startMs: number, weeks: number): T[] {
  const seen = new Map<string, Set<number>>();
  for (const a of articles) {
    if (!a.source || DUPLICATE_SOURCE.test(a.source)) continue;
    (seen.get(a.source) ?? seen.set(a.source, new Set()).get(a.source)!).add(weekIndex(a, startMs));
  }
  const steady = new Set([...seen].filter(([, w]) => w.size >= weeks * STEADY_SHARE).map(([s]) => s));
  return articles.filter(a => steady.has(a.source));
}

/**
 * The luxury trade press for the themes chapter: sources the registry files
 * under Fashion & Luxury, minus watch blogs and design, present in at least
 * STEADY_SHARE of the months. Deduplicated by id.
 */
export function luxuryPressPanel<T extends ReviewArticle>(articles: T[], months: string[]): T[] {
  const names = new Set([...SOURCE_FEEDS, ...SOURCE_PAGES]
    .filter(s => s.categoryHint === 'Fashion & Luxury' && !NOT_MARKET_COVERAGE.test(s.name) && !DUPLICATE_SOURCE.test(s.name))
    .map(s => s.name));
  const wanted = new Set(months);
  const mine = articles.filter(a => names.has(a.source) && wanted.has(monthOf(a)) && a.title);
  const active = new Map<string, Set<string>>();
  for (const a of mine) (active.get(a.source) ?? active.set(a.source, new Set()).get(a.source)!).add(monthOf(a));
  const steady = new Set([...active].filter(([, m]) => m.size >= months.length * STEADY_SHARE).map(([s]) => s));
  const ids = new Set<string>();
  return mine.filter(a => steady.has(a.source) && !ids.has(a.id) && ids.add(a.id));
}
