/**
 * The brands each Markets page tracks.
 *
 * Patterns are matched against an article's title and snippet. Each brand
 * name below has collided with something that isn't the brand: the old
 * Competitor Watch matched "jared" to Jared Kushner and filed Ukraine peace talks
 * under Signet. `exclude` drops an article for that brand when the other meaning is
 * the likely one. Every pattern and exclusion is pinned by
 * __tests__/markets.brands.test.ts.
 */

import type { MarketId } from '@/lib/markets/types';

export interface TrackedBrand {
  name: string;
  market: MarketId;
  /** Parent company, shown under the name. */
  group: string;
  pattern: RegExp;
  exclude?: RegExp;
  /** Listed company whose share price represents this brand, if any. */
  ticker?: string;
}

/** Display names for tickers, so the price chart shows companies, not codes. */
export const TICKER_COMPANY: Record<string, string> = {
  'MC.PA': 'LVMH',
  'RMS.PA': 'Hermès',
  'KER.PA': 'Kering',
  '1913.HK': 'Prada',
  'BRBY.L': 'Burberry',
  'CFR.SW': 'Richemont',
  'MONC.MI': 'Moncler',
  'PNDORA.CO': 'Pandora',
  'SIG': 'Signet',
  '1929.HK': 'Chow Tai Fook',
  'BRLT': 'Brilliant Earth',
};

export const BRANDS: TrackedBrand[] = [
  // ── Luxury ────────────────────────────────────────────────────────────────
  { market: 'luxury', name: 'Rolex', group: 'Private', pattern: /\bRolex\b/i },
  { market: 'luxury', name: 'Chanel', group: 'Private', pattern: /\bChanel\b/i },
  { market: 'luxury', name: 'LVMH', group: 'LVMH', pattern: /\bLVMH\b/i, ticker: 'MC.PA' },
  { market: 'luxury', name: 'Louis Vuitton', group: 'LVMH', pattern: /\bLouis Vuitton\b/i, ticker: 'MC.PA' },
  { market: 'luxury', name: 'Dior', group: 'LVMH', pattern: /\bDior\b/i, ticker: 'MC.PA' },
  {
    market: 'luxury', name: 'Hermès', group: 'Hermès', ticker: 'RMS.PA',
    pattern: /\bHerm[eè]s\b/i,
    // The UK parcel carrier (now Evri) traded as Hermes and turns up in ecommerce news.
    exclude: /\bHermes\s+(parcel|delivery|courier|UK|Germany|Group)\b|\bEvri\b|parcelnet/i,
  },
  { market: 'luxury', name: 'Kering', group: 'Kering', pattern: /\bKering\b/i, ticker: 'KER.PA' },
  { market: 'luxury', name: 'Gucci', group: 'Kering', pattern: /\bGucci\b/i, ticker: 'KER.PA' },
  { market: 'luxury', name: 'Prada', group: 'Prada', pattern: /\bPrada\b/i, ticker: '1913.HK' },
  { market: 'luxury', name: 'Burberry', group: 'Burberry', pattern: /\bBurberry\b/i, ticker: 'BRBY.L' },
  { market: 'luxury', name: 'Richemont', group: 'Richemont', pattern: /\bRichemont\b/i, ticker: 'CFR.SW' },
  { market: 'luxury', name: 'Moncler', group: 'Moncler', pattern: /\bMoncler\b/i, ticker: 'MONC.MI' },

  // ── Jewellery ─────────────────────────────────────────────────────────────
  { market: 'jewellery', name: 'Cartier', group: 'Richemont', pattern: /\bCartier\b/i, ticker: 'CFR.SW' },
  { market: 'jewellery', name: 'Bulgari', group: 'LVMH', pattern: /\bBulgari\b|\bBvlgari\b/i, ticker: 'MC.PA' },
  {
    market: 'jewellery', name: 'Tiffany & Co.', group: 'LVMH', ticker: 'MC.PA',
    pattern: /\bTiffany\b/i,
    // A common first name, and a lamp style.
    exclude: /\bTiffany\s+(Haddish|Trump|lamps?|glass|Young|Cross)\b/i,
  },
  { market: 'jewellery', name: 'Van Cleef & Arpels', group: 'Richemont', pattern: /\bVan Cleef\b/i, ticker: 'CFR.SW' },
  {
    market: 'jewellery', name: 'Pandora', group: 'Pandora', ticker: 'PNDORA.CO',
    pattern: /\bPandora\b/i,
    // The leaked-documents investigation and the music service.
    exclude: /\bPandora\s+(Papers|Radio|Media|music|Premium)\b|\bSiriusXM\b|streaming/i,
  },
  {
    market: 'jewellery', name: 'Signet', group: 'Signet', ticker: 'SIG',
    // Signet's own banners; "Jared" alone matched Jared Kushner.
    pattern: /\bSignet Jewel|\bSignet\b(?!\s+rings?)|\bKay Jewel|\bZales\b|\bJared (Jewel|the Galleria)/i,
    exclude: /\bsignet rings?\b/i,
  },
  { market: 'jewellery', name: 'De Beers', group: 'Anglo American', pattern: /\bDe Beers\b/i },
  { market: 'jewellery', name: 'Swarovski', group: 'Private', pattern: /\bSwarovski\b/i },
  { market: 'jewellery', name: 'Chow Tai Fook', group: 'Chow Tai Fook', pattern: /\bChow Tai Fook\b/i, ticker: '1929.HK' },
  { market: 'jewellery', name: 'Brilliant Earth', group: 'Brilliant Earth', pattern: /\bBrilliant Earth\b/i, ticker: 'BRLT' },
  { market: 'jewellery', name: 'Mejuri', group: 'Private', pattern: /\bMejuri\b/i },
  { market: 'jewellery', name: 'Monica Vinader', group: 'Private', pattern: /\bMonica Vinader\b/i },
];

export function brandsFor(market: MarketId): TrackedBrand[] {
  return BRANDS.filter(b => b.market === market);
}

/** Does this text refer to the brand? Applies the brand's exclusion. */
export function mentionsBrand(brand: TrackedBrand, text: string): boolean {
  if (!brand.pattern.test(text)) return false;
  return !(brand.exclude && brand.exclude.test(text));
}
