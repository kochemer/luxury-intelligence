/**
 * Where the market disagrees with the coverage: articles about each listed
 * company against its 3-month share-price change.
 *
 * Coverage counts the company together with its brands, across all sources:
 * LVMH's coverage is mostly Louis Vuitton, Dior and Tiffany, and the share
 * price is the group's. The aha cases are companies whose shares moved a lot
 * with almost no coverage (Signet, Brilliant Earth: +23% each, 5 and 0
 * articles, on 2026-10-09), and the most-covered group falling regardless.
 */

import type { AttentionCallout, AttentionRow, MarketId, MarketPrice } from '@/lib/markets/types';
import { articleText } from './coverage';
import type { SignalArticle } from './signals';

/** Same false-positive exclusions as markets/brands.ts, applied at group level. */
const COMPANIES: Record<string, { name: string; re: RegExp; exclude?: RegExp }> = {
  'MC.PA': { name: 'LVMH', re: /\bLVMH\b|Louis Vuitton|\bDior\b|\bBulgari\b|\bBvlgari\b|\bTiffany\b|\bSephora\b|\bFendi\b|\bCeline\b|\bLoewe\b|TAG Heuer|\bHublot\b/i, exclude: /Tiffany\s+(Haddish|Trump|lamps?|glass)/i },
  'RMS.PA': { name: 'Hermès', re: /\bHerm[eè]s\b/i, exclude: /\bHermes\s+(parcel|delivery|courier|UK|Germany|Group)\b|\bEvri\b/i },
  'KER.PA': { name: 'Kering', re: /\bKering\b|\bGucci\b|Saint Laurent|Bottega Veneta|\bBalenciaga\b|\bBoucheron\b/i },
  'CFR.SW': { name: 'Richemont', re: /\bRichemont\b|\bCartier\b|Van Cleef|\bIWC\b|Jaeger-LeCoultre|\bPanerai\b|\bMontblanc\b|Vacheron/i },
  '1913.HK': { name: 'Prada', re: /\bPrada\b|Miu Miu/i },
  'BRBY.L': { name: 'Burberry', re: /\bBurberry\b/i },
  'MONC.MI': { name: 'Moncler', re: /\bMoncler\b/i },
  'PNDORA.CO': { name: 'Pandora', re: /\bPandora\b/i, exclude: /\bPandora\s+(Papers|Radio|Media|music|Premium)\b|\bSiriusXM\b|streaming/i },
  'SIG': { name: 'Signet', re: /\bSignet Jewel|\bSignet\b(?!\s+rings?)|\bKay Jewel|\bZales\b|\bJared (Jewel|the Galleria)/i, exclude: /\bsignet rings?\b/i },
  '1929.HK': { name: 'Chow Tai Fook', re: /\bChow Tai Fook\b/i },
  'BRLT': { name: 'Brilliant Earth', re: /\bBrilliant Earth\b/i },
};

/** `articles` must already be the 12-week window. */
export function attentionRows(articles: SignalArticle[], prices: MarketPrice[]): AttentionRow[] {
  return prices.flatMap(p => {
    const c = COMPANIES[p.ticker];
    if (!c) return [];
    const articlesAbout = articles.filter(a => {
      const text = articleText(a);
      return c.re.test(text) && !(c.exclude && c.exclude.test(text));
    }).length;
    return [{
      ticker: p.ticker, company: c.name, articles: articlesAbout,
      change3m: Math.round(p.change3m * 10) / 10, change1m: Math.round(p.change1m * 10) / 10,
    }];
  });
}

/** A move this big with this little coverage is the story. */
export const QUIET_MIN_MOVE = 15;
export const QUIET_MAX_ARTICLES = 10;
export const LOUD_MIN_ARTICLES = 50;

export function attentionCallouts(rows: AttentionRow[], market: MarketId): AttentionCallout[] {
  const out: AttentionCallout[] = [];
  for (const r of rows) {
    const pct = Math.abs(r.change3m).toFixed(0);
    if (Math.abs(r.change3m) >= QUIET_MIN_MOVE && r.articles <= QUIET_MAX_ARTICLES) {
      const coverage = r.articles === 0 ? 'no articles' : `just ${r.articles} article${r.articles === 1 ? '' : 's'}`;
      out.push({ company: r.company, kind: 'quiet', change3m: r.change3m,
        text: `${r.company} shares ${r.change3m > 0 ? 'rose' : 'fell'} ${pct}% in three months, with ${coverage} about it in 12 weeks.` });
    } else if (market === 'luxury' && r.change3m <= -QUIET_MIN_MOVE && r.articles >= LOUD_MIN_ARTICLES
      && r.articles === Math.max(...rows.map(x => x.articles))) {
      // Luxury only: on the jewellery page the most-covered groups (LVMH,
      // Richemont) are covered for their fashion houses, not their jewellery.
      out.push({ company: r.company, kind: 'loud', change3m: r.change3m,
        text: `${r.company} is the most-covered group here (${r.articles} articles in 12 weeks), and its shares fell ${pct}%.` });
    }
  }
  return out;
}
