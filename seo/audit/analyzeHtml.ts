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
  /** Every image on the page, with the attributes that decide how costly it is. */
  images: PageImage[];
  /** CSS background-image URLs found in inline styles — invisible to <img> checks. */
  backgroundImages: string[];
  /** Same-site links found on the page, for building the internal link graph. */
  internalLinks: InternalLink[];
  /** Heading levels in document order, e.g. [1,2,2,3] — for hierarchy checks. */
  headingLevels: number[];
  /** Visible text length, as a rough proxy for content depth. */
  textLength: number;
}

export interface PageImage {
  src: string;
  /** Whether the browser is told to defer this image. */
  lazy: boolean;
  /** Whether responsive candidates were provided. */
  hasSrcSet: boolean;
  /** True when routed through Next's optimiser, which handles format and size. */
  optimised: boolean;
  alt: string | null;
}

export interface InternalLink {
  /** Absolute, same-origin URL with any fragment and trailing slash removed. */
  href: string;
  /** Anchor text, trimmed. Empty when the link wraps an image or icon. */
  text: string;
}

/** Generic anchor text that tells neither users nor Google what the target is. */
const GENERIC_ANCHORS = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'this', 'this page',
  'learn more', 'see more', 'view', 'go', 'continue', 'details',
]);

export function isGenericAnchor(text: string): boolean {
  return GENERIC_ANCHORS.has(text.trim().toLowerCase().replace(/[→←.…]/g, '').trim());
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
  const images: PageImage[] = [];
  let imageCount = 0;
  $('img').each((_, el) => {
    imageCount++;
    const alt = $(el).attr('alt');
    const ariaHidden = $(el).attr('aria-hidden') === 'true';
    const src = $(el).attr('src') ?? '';

    images.push({
      src,
      lazy: $(el).attr('loading') === 'lazy',
      hasSrcSet: Boolean($(el).attr('srcset') || $(el).attr('srcSet')),
      // Next rewrites optimised images through /_next/image, which converts
      // format and generates sizes. A raw path means none of that happened.
      optimised: src.includes('/_next/image'),
      alt: alt ?? null,
    });

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

  // Heading levels in document order, so hierarchy skips (h1 → h3) are visible.
  const headingLevels: number[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = (el as { tagName?: string }).tagName ?? '';
    const level = Number(tag.replace(/\D/g, ''));
    if (level >= 1 && level <= 6) headingLevels.push(level);
  });

  // Internal links, normalised so the graph can match hrefs to page URLs.
  const origin = (() => { try { return new URL(url).origin; } catch { return null; } })();
  const internalLinks: InternalLink[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href');
    if (!raw || !origin) return;
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) return;

    let resolved: URL;
    try { resolved = new URL(raw, url); } catch { return; }
    if (resolved.origin !== origin) return;

    // Drop the fragment and any trailing slash so /archive, /archive/ and
    // /archive#top all count as links to the same page.
    const href = `${resolved.origin}${resolved.pathname.replace(/\/+$/, '') || '/'}`;
    const text = $(el).text().trim().replace(/\s+/g, ' ');

    // One entry per (target, anchor text) pair — repeated nav links on the same
    // page shouldn't inflate a target's inbound count.
    const key = `${href}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);

    internalLinks.push({ href, text });
  });

  // Hero images are often CSS backgrounds rather than <img>, so they escape
  // every <img>-based check while still being the largest download on the page.
  const backgroundImages: string[] = [];
  $('[style*="background-image"]').each((_, el) => {
    const style = $(el).attr('style') ?? '';
    for (const match of style.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
      const url = match[2];
      if (url && !url.startsWith('data:')) backgroundImages.push(url);
    }
  });

  return {
    images,
    backgroundImages: [...new Set(backgroundImages)],
    internalLinks,
    headingLevels,
    textLength: $('body').text().replace(/\s+/g, ' ').trim().length,
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
