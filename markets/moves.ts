/**
 * One event, one move.
 *
 * Google News returns the same story from many outlets with different
 * headlines: Rolex's Perpetual Padellone came back as four separate "moves"
 * on the first real build. Candidate de-duplication can't catch these: the
 * original headlines differ. The classifier's neutral restatements don't, so
 * moves are merged on those, and the number of outlets is kept as a signal of
 * how widely the event was covered.
 */

import type { MarketMove } from '@/lib/markets/types';
import { mentionsBrand, type TrackedBrand } from './brands';

const MERGE_WINDOW_DAYS = 14;
const SIMILARITY = 0.5;
const STOP = new Set(['the', 'and', 'for', 'with', 'its', 'new', 'has', 'have', 'from', 'into', 'launches', 'launched', 'launch', 'unveils', 'unveiled', 'presents', 'presented', 'announces', 'announced']);

/** Accents stripped first: "Kué" was splitting into "ku" and vanishing. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function words(s: string): Set<string> {
  return new Set(fold(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
}

/**
 * Capitalised names in a headline, other than the brand's own. Two reports
 * of one deal often share nothing else: "agrees Gahcho Kué deal" and
 * "acquires 49% stake in Gahcho Kué" (De Beers, first real build).
 * Seasons and cities don't count: two Paris shows aren't one event.
 */
const GENERIC = new Set(['spring', 'summer', 'fall', 'autumn', 'winter', 'cruise', 'resort', 'paris', 'milan', 'london', 'york', 'fashion', 'week']);
function names(headline: string, brand: string): Set<string> {
  const own = words(brand);
  return new Set(fold(headline).split(/\s+/).slice(1)
    .filter(w => /^[A-Z][A-Za-z]{3,}/.test(w))
    .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
    .filter(w => w.length > 3 && !own.has(w) && !GENERIC.has(w)));
}

function similar(a: MarketMove, b: MarketMove): boolean {
  if (a.brand !== b.brand || a.type !== b.type) return false;
  const days = Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 864e5;
  if (days > MERGE_WINDOW_DAYS) return false;
  // The brand, seasons, cities and years are in every fashion-week headline,
  // so they say nothing about whether two headlines are the same event.
  const own = words(a.brand);
  const distinctive = (h: string) => new Set([...words(h)].filter(w => !own.has(w) && !GENERIC.has(w) && !/^\d{4}$/.test(w)));
  const wa = distinctive(a.headline), wb = distinctive(b.headline);
  const shared = [...wa].filter(w => wb.has(w)).length;
  if (shared / Math.max(1, Math.min(wa.size, wb.size)) >= SIMILARITY) return true;
  // Same brand, same kind of move, within days, naming the same thing.
  if (days <= 3) {
    const nb = names(b.headline, b.brand);
    if ([...names(a.headline, a.brand)].some(n => nb.has(n))) return true;
  }
  return false;
}

/** Merge moves describing the same event. Keeps the earliest report. Newest first. */
export function mergeEvents(moves: MarketMove[]): MarketMove[] {
  const merged: MarketMove[] = [];
  for (const m of [...moves].sort((a, b) => a.date.localeCompare(b.date))) {
    const same = merged.find(k => similar(k, m));
    if (same) {
      same.outlets += m.outlets;
      if (m.importance === 'major') same.importance = 'major';
    } else {
      merged.push({ ...m });
    }
  }
  return merged.sort((a, b) => b.date.localeCompare(a.date) || a.brand.localeCompare(b.brand));
}

/** A brand's headline move: its latest major one, else its latest. */
export function latestMoveFor(brand: string, moves: MarketMove[]): MarketMove | null {
  const own = moves.filter(m => m.brand === brand);
  return own.find(m => m.importance === 'major') ?? own[0] ?? null;
}

/**
 * What the page shows for a move.
 *
 * The publisher's headline by default: it's attributable and can't misstate
 * the story. Falls back to the checked restatement only when the original
 * is unusable on its own: it doesn't name the brand ("New releases from
 * Blancpain, Czapek, Grand Seiko and more" under Rolex), or it's a fragment
 * list ("Prada - Fashion Week - atmosphere - Womenswear - …").
 */
export function displayTitle(originalTitle: string, restatement: string, brand: TrackedBrand): string {
  const cleaned = originalTitle.replace(/\s+[|–-]\s+[^|–-]{2,40}$/, '').trim();
  const fragments = cleaned.split(/\s+-\s+/).length >= 3;
  if (!fragments && cleaned.length <= 120 && mentionsBrand(brand, cleaned)) return cleaned;
  return restatement;
}
