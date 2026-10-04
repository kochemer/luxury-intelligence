/**
 * Headlines that might be company moves, before the classifier decides.
 *
 * Two sources:
 *  - the publication's own articles naming the brand (last 6 weeks)
 *  - a Google News feed per brand, because four jewellery brands had no
 *    coverage at all in the publication's sources over 12 weeks
 *
 * Google News is used for moves only, never for share-of-voice counts.
 */

import { createHash } from 'crypto';
import Parser from 'rss-parser';
import type { TrackedBrand } from './brands';
import { mentionsBrand } from './brands';
import { articleText, articleTime, type CoverageArticle } from './coverage';

export const MOVES_WEEKS = 6;
/** Newest items taken per brand from Google News; older ones are rarely news. */
const NEWS_PER_BRAND = 10;

export interface Candidate {
  /** Stable across runs, so classifications can be cached. */
  key: string;
  brand: string;
  title: string;
  snippet: string;
  source: string;
  url: string;
  date: string; // YYYY-MM-DD
  origin: 'own' | 'news';
}

export const candidateKey = (brand: string, url: string) =>
  createHash('sha1').update(`${brand}|${url}`).digest('hex').slice(0, 16);

/**
 * Searches that find the company rather than its other meanings. Defaults to
 * the quoted name.
 */
const NEWS_QUERY: Record<string, string> = {
  'Pandora': '"Pandora" (jewellery OR jewelry OR charms)',
  'Signet': '"Signet Jewelers" OR "Kay Jewelers" OR "Zales"',
  'Tiffany & Co.': '"Tiffany & Co"',
  'Hermès': '"Hermès" luxury',
  'Van Cleef & Arpels': '"Van Cleef & Arpels"',
};

export function ownCandidates(
  articles: (CoverageArticle & { url: string; source: string })[],
  brands: TrackedBrand[],
  endMs: number
): Candidate[] {
  const start = endMs - MOVES_WEEKS * 7 * 864e5;
  const out: Candidate[] = [];
  for (const a of articles) {
    const t = articleTime(a);
    if (t < start || t >= endMs) continue;
    for (const b of brands) {
      if (!mentionsBrand(b, articleText(a))) continue;
      out.push({
        key: candidateKey(b.name, a.url), brand: b.name, title: a.title.trim(), snippet: (a.snippet ?? '').slice(0, 300),
        source: a.source, url: a.url, date: new Date(t).toISOString().slice(0, 10), origin: 'own',
      });
    }
  }
  return out;
}

/** Google News titles end in " - Publisher". Split it off. */
export function splitNewsTitle(raw: string): { title: string; source: string } {
  const i = raw.lastIndexOf(' - ');
  return i > 0 ? { title: raw.slice(0, i).trim(), source: raw.slice(i + 3).trim() } : { title: raw.trim(), source: 'Google News' };
}

export async function newsCandidates(brands: TrackedBrand[], endMs: number): Promise<Candidate[]> {
  const parser = new Parser({ timeout: 15_000, headers: { 'User-Agent': 'LuxuryIntelMarkets/1.0 (+https://luxury-intel.com)' } });
  const start = endMs - MOVES_WEEKS * 7 * 864e5;
  const out: Candidate[] = [];

  for (const b of brands) {
    const q = NEWS_QUERY[b.name] ?? `"${b.name}"`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${MOVES_WEEKS * 7}d`)}&hl=en-GB&gl=GB&ceid=GB:en`;
    try {
      const feed = await parser.parseURL(url);
      const items = (feed.items ?? [])
        .map(i => ({ ...splitNewsTitle(i.title ?? ''), link: i.link ?? '', t: new Date(i.isoDate ?? i.pubDate ?? 0).getTime() }))
        .filter(i => i.link && i.t >= start && i.t < endMs && mentionsBrand(b, i.title))
        .sort((x, y) => y.t - x.t)
        .slice(0, NEWS_PER_BRAND);
      for (const i of items) {
        out.push({
          key: candidateKey(b.name, i.link), brand: b.name, title: i.title, snippet: '',
          source: i.source, url: i.link, date: new Date(i.t).toISOString().slice(0, 10), origin: 'news',
        });
      }
    } catch (err) {
      console.warn(`[Markets] ⚠ Google News for ${b.name}: ${err instanceof Error ? err.message.slice(0, 80) : err}`);
    }
  }
  return out;
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2));

/** Same brand, near-identical headline: keep the earliest (the original report). */
export function dedupe<T extends { brand: string; title: string; date: string }>(items: T[]): T[] {
  const kept: T[] = [];
  for (const item of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    const w = words(item.title);
    const dup = kept.some(k => {
      if (k.brand !== item.brand) return false;
      const kw = words(k.title);
      const shared = [...w].filter(x => kw.has(x)).length;
      return shared / Math.max(1, Math.min(w.size, kw.size)) >= 0.7;
    });
    if (!dup) kept.push(item);
  }
  return kept;
}
