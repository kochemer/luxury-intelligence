/**
 * Pure HTML analysis — no network, no fs. Given a page's HTML and the URL it
 * was requested from, return what the SEO auditor needs to know about it.
 *
 * Kept separate from liveAudit.ts so the parsing logic can be unit-tested
 * against saved HTML fixtures without any fetching.
 */

import * as cheerio from 'cheerio';

export interface JsonLdBlock {
  /** Parsed object, or null when the block failed to parse. */
  data: Record<string, unknown> | null;
  /** `@type` values found, flattened (a block may be an array or use @graph). */
  types: string[];
  raw: string;
  parseError?: string;
}

export interface PageAnalysis {
  url: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  /** True when a robots meta tag asks for noindex. */
  noindex: boolean;
  robotsMeta: string | null;
  h1s: string[];
  ogImage: string | null;
  /** hreflang → href, from <link rel="alternate"> tags. */
  hreflang: Record<string, string>;
  jsonLd: JsonLdBlock[];
  /** <img> elements with a missing or empty alt attribute (src values). */
  imagesMissingAlt: string[];
  /** Total <img> count, for context on the above. */
  imageCount: number;
}

/** Flatten the `@type` values out of a JSON-LD payload, including `@graph` entries. */
function extractTypes(data: unknown): string[] {
  if (data === null || typeof data !== 'object') return [];

  if (Array.isArray(data)) return data.flatMap(extractTypes);

  const obj = data as Record<string, unknown>;
  const types: string[] = [];

  const t = obj['@type'];
  if (typeof t === 'string') types.push(t);
  else if (Array.isArray(t)) types.push(...t.filter((x): x is string => typeof x === 'string'));

  // A @graph holds sibling entities; their types count as present on the page.
  if (Array.isArray(obj['@graph'])) types.push(...obj['@graph'].flatMap(extractTypes));

  return types;
}

export function analyzeHtml(html: string, url: string): PageAnalysis {
  const $ = cheerio.load(html);

  const robotsMeta = $('meta[name="robots"]').attr('content') ?? null;

  const hreflang: Record<string, string> = {};
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang');
    const href = $(el).attr('href');
    if (lang && href) hreflang[lang] = href;
  });

  const jsonLd: JsonLdBlock[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      jsonLd.push({ data, types: extractTypes(data), raw });
    } catch (err) {
      jsonLd.push({
        data: null,
        types: [],
        raw,
        parseError: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const imagesMissingAlt: string[] = [];
  let imageCount = 0;
  $('img').each((_, el) => {
    imageCount++;
    const alt = $(el).attr('alt');
    const ariaHidden = $(el).attr('aria-hidden') === 'true';

    // Only an *absent* alt attribute is a defect. `alt=""` is the correct,
    // deliberate marker for a decorative image — it tells screen readers to
    // skip it — so flagging it would be wrong. (An earlier version of this
    // check treated empty alt as missing and produced 40 false positives on
    // the site's decorative source favicons.)
    if (!ariaHidden && alt === undefined) {
      imagesMissingAlt.push($(el).attr('src') ?? '(no src)');
    }
  });

  const h1s: string[] = [];
  $('h1').each((_, el) => {
    h1s.push($(el).text().trim());
  });

  return {
    url,
    title: $('head title').first().text().trim() || null,
    description: $('meta[name="description"]').attr('content')?.trim() ?? null,
    canonical: $('link[rel="canonical"]').attr('href')?.trim() ?? null,
    noindex: /\bnoindex\b/i.test(robotsMeta ?? ''),
    robotsMeta,
    h1s,
    ogImage: $('meta[property="og:image"]').attr('content')?.trim() ?? null,
    hreflang,
    jsonLd,
    imagesMissingAlt,
    imageCount,
  };
}
