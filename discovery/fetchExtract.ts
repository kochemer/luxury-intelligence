/**
 * @module fetchExtract
 *
 * Fetches and extracts article content from candidate URLs discovered by the
 * search pipeline. Uses a three-strategy waterfall:
 *
 * 1. **Direct HTTP fetch** — tries to download the page itself (15 s timeout).
 *    Parses HTML with cheerio using progressive selector fallback to locate the
 *    main article body.
 * 2. **Tavily Extract API** — used as a fallback when the direct fetch returns
 *    too little content or detects a paywall. Better at bypassing JS-rendered
 *    pages and consultant/gated sites.
 * 3. **`time_text` date inference** — if neither strategy yields a publication
 *    date, a final pass tries to infer it from visible timestamp text in the
 *    page (`<time>`, "Published:", relative times like "2 hours ago", etc.).
 *
 * ## Date confidence levels
 * - `high`   — date came from JSON-LD `datePublished` or an explicit `<time datetime>` attribute.
 * - `medium` — date came from an HTML `<meta>` tag or a structured Tavily field.
 * - `low`    — date was inferred from visible text or is approximate.
 *
 * ## Paywall detection
 * Paywall status is determined in two stages:
 * - HTTP: 401/402/403 responses are flagged as `likely_paywalled`.
 * - Text: a set of regex patterns scans the extracted text for subscription prompts.
 * Paywalled articles are kept in the output (they may still have useful metadata)
 * but are flagged so downstream filters can deprioritise them.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { SearchResult } from './searchProvider';
import { isConsultancyDomain } from './consultancyDomains';
import { isPlatformDomain } from './platformDomains';
import { extractPublishedAtFromHtml, normalizePublishedAt, type ExtractPublishedAtOptions } from '../lib/utils/extractPublishedAt';
import { getDomainRule } from './domainRules';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Browser-like UA used for direct article fetches (also by selection/fullText.ts). */
export const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const TAVILY_EXTRACT_API_URL = 'https://api.tavily.com/extract';

/**
 * A fully-extracted article candidate, enriched with metadata derived during
 * the fetch + parse phase. Written into `data/discovery/<week>/extracted/`.
 */
export type ExtractedArticle = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  /** ISO date string from the Tavily search result (may be approximate). */
  publishedDate?: string;
  /** Normalised ISO 8601 timestamp used for week-window filtering. */
  publishedAt?: string | null;
  /** Raw date string before normalisation — preserved for debugging. */
  publishedDateRaw?: string;
  /** True when the date could not be determined or parsed. */
  publishedDateInvalid?: boolean;
  /** Which extraction pass produced the date. */
  dateSource?: 'html' | 'tavily' | 'none' | 'time_text';
  /** Granular source detail within the winning pass. */
  dateSourceDetail?: 'jsonld' | 'meta' | 'time' | 'time_text' | 'tavily' | 'none';
  /** Confidence level for the extracted date — see module doc for thresholds. */
  dateConfidence?: 'high' | 'medium' | 'low';
  extractedText: string;
  wordCount: number;
  author?: string;
  /** 16-char SHA-256 hex hash of the URL; used as a deduplication key. */
  hash: string;
  topic: SearchResult['topic'];
  /** ISO timestamp of when this article was extracted (pipeline run time). */
  discoveredAt?: string;
  /** Identifies the discovery channel: standard search, consultancy crawl, or platform crawl. */
  sourceType?: 'discovery' | 'consultancy' | 'platform';
  /** Paywall detection outcome — paywalled articles are kept but deprioritised. */
  paywallStatus?: 'not_paywalled' | 'likely_paywalled' | 'unknown';
  paywallReason?: string;
};

/**
 * Generates a 16-character hex hash of a URL used as a filesystem cache key.
 * SHA-256 is used for collision resistance (not security); the substring keeps
 * filenames short while remaining practically unique across ~200 articles/week.
 */
function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
}

/**
 * Wrap a promise with a timeout
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    createTimeout(ms).then(() => {
      throw new Error(errorMessage);
    })
  ]);
}

/**
 * Extract content from a URL using Tavily's Extract API
 * This is more reliable for consultancy sites that block direct fetches
 */
async function extractWithTavily(url: string): Promise<{ content: string; title: string; publishedDate?: string } | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(TAVILY_EXTRACT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [url],
        extract_depth: 'advanced', // Use advanced for better content extraction
        include_images: false,
        chunks_per_source: 3, // Limit chunks to avoid huge content
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Tavily Extract] Failed for ${url}: ${response.status} ${errorText}`);
      return null;
    }

    const data = (await response.json()) as { results?: unknown[] } | unknown[];

    // Tavily Extract: results[] or top-level array
    const results = Array.isArray(data) ? data
      : (data && typeof data === 'object' && Array.isArray((data as { results?: unknown[] }).results))
        ? (data as { results: unknown[] }).results : [];
    const first = results[0] as Record<string, unknown> | undefined;

    if (first) {
      // Prefer content, then raw_content
      const content = typeof first.content === 'string' ? first.content
        : typeof first.raw_content === 'string' ? first.raw_content
        : '';
      const title = typeof first.title === 'string' ? first.title : '';
      const publishedDate = typeof first.published_date === 'string' ? first.published_date : undefined;

      if (content && content.length >= 200) {
        return { content, title, publishedDate };
      }
    }

    // Log when we get 200 but no usable content (helps debug API response shape)
    console.warn(`[Tavily Extract] No usable content for ${url} (results=${results.length})`);
    return null;
  } catch (error: any) {
    console.warn(`[Tavily Extract] Error for ${url}:`, error.message);
    return null;
  }
}

type FetchResult = {
  html: string | null;
  paywallStatus: 'not_paywalled' | 'likely_paywalled' | 'unknown';
  paywallReason?: string;
};

/**
 * Fetches raw HTML for a URL, caching the result to `fetchDir/<hash>.html`.
 *
 * Cache hits skip the network entirely, which makes re-runs during a single
 * pipeline execution cheap. Cache is scoped to the weekly discovery directory
 * so stale HTML doesn't carry across weeks.
 *
 * Paywall detection is performed in two passes:
 * 1. HTTP status — 401/402/403 → `likely_paywalled`.
 * 2. HTML text scan — presence of any `PAYWALL_HTML_MARKERS` substring.
 *
 * Returns `html: null` on timeout, network error, or non-200 response.
 */
async function fetchHtml(url: string, fetchDir: string): Promise<FetchResult> {
  const hash = hashUrl(url);
  const htmlPath = path.join(fetchDir, `${hash}.html`);

  // Check cache
  try {
    const cached = await fs.readFile(htmlPath, 'utf-8');
    return { html: cached, paywallStatus: 'unknown' }; // Can't determine paywall from cache
  } catch {
    // Continue to fetch
  }

  try {
    // Use AbortController for timeout (15 seconds total)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);

      // Check for paywall HTTP status codes
      if (response.status === 401 || response.status === 402 || response.status === 403) {
        return {
          html: null,
          paywallStatus: 'likely_paywalled',
          paywallReason: `HTTP ${response.status}`
        };
      }

      if (!response.ok) {
        console.warn(`[Fetch] Failed to fetch ${url}: ${response.status}`);
        return { html: null, paywallStatus: 'unknown', paywallReason: `HTTP ${response.status}` };
      }

      // Wrap text() call with timeout (10 seconds)
      const html = await withTimeout(
        response.text(),
        10000,
        `Text extraction timeout for ${url}`
      );
      
      // Check HTML for paywall markers
      const htmlLower = html.toLowerCase();
      const hasPaywallMarker = PAYWALL_HTML_MARKERS.some(marker => htmlLower.includes(marker));
      
      // Save to cache
      await fs.mkdir(fetchDir, { recursive: true });
      await fs.writeFile(htmlPath, html, 'utf-8');
      
      return {
        html,
        paywallStatus: hasPaywallMarker ? 'likely_paywalled' : 'not_paywalled',
        paywallReason: hasPaywallMarker ? 'HTML paywall markers detected' : undefined
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`[Fetch] Timeout fetching ${url} after 15s`);
    } else {
      console.warn(`[Fetch] Error fetching ${url}: ${error.message}`);
    }
    return { html: null, paywallStatus: 'unknown', paywallReason: error.message };
  }
}

/**
 * Walks all `<script type="application/ld+json">` blocks in the page and
 * returns the first value found for any of: `datePublished`, `dateCreated`,
 * `dateModified`, `uploadDate`. Handles `@graph` arrays and nested objects.
 *
 * Called as a fallback when HTML `<meta>` date selectors return nothing.
 * Yields `dateConfidence: 'high'` because JSON-LD dates are publisher-canonical.
 */
function extractDateFromJsonLd($: cheerio.Root): string | undefined {
  const scripts = $('script[type="application/ld+json"]');
  if (scripts.length === 0) return undefined;

  const extractFromObject = (obj: unknown): string | undefined => {
    if (!obj || typeof obj !== 'object') return undefined;

    const asRecord = obj as Record<string, unknown>;
    const candidateKeys = ['datePublished', 'dateCreated', 'dateModified', 'uploadDate'];
    for (const key of candidateKeys) {
      const value = asRecord[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    // Handle @graph arrays or nested objects
    for (const value of Object.values(asRecord)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = extractFromObject(item);
          if (found) return found;
        }
      } else if (value && typeof value === 'object') {
        const found = extractFromObject(value);
        if (found) return found;
      }
    }

    return undefined;
  };

  for (const el of scripts.toArray()) {
    const raw = $(el).text();
    if (!raw || raw.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const found = extractFromObject(item);
          if (found) return found;
        }
      } else {
        const found = extractFromObject(parsed);
        if (found) return found;
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  return undefined;
}

/**
 * Extracts clean article text, title, author, and publication date from raw HTML.
 *
 * Content selector waterfall (first match with >500 chars wins):
 * `article` → `[role="main"]` → `main` → `.article-body` → `.post-content`
 * → `.entry-content` → `.content` → `body`
 *
 * Title selector priority: `og:title` meta → `article:title` meta → `<h1>` → `<title>`.
 *
 * Date selector priority: various `<time>` and `<meta>` date attributes, then
 * falls back to JSON-LD via `extractDateFromJsonLd`.
 */
export function extractText(html: string, url: string): { text: string; title: string; author?: string; date?: string } {
  const $ = cheerio.load(html);
  
  // Remove script and style elements
  $('script, style, noscript, iframe, embed, object').remove();
  
  // Try to find main content
  let content = '';
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.article-body',
    '.post-content',
    '.entry-content',
    '.content',
    'body'
  ];
  
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      content = element.text();
      if (content.length > 500) break; // Found substantial content
    }
  }
  
  // Fallback to body if nothing found
  if (content.length < 500) {
    content = $('body').text();
  }
  
  // Clean up text
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
  
  // Extract title - prefer article-specific meta tags over generic page title
  let title = '';
  const titleSelectors = [
    'meta[property="og:title"]',
    'meta[name="article:title"]',
    'meta[property="article:title"]',
    'h1',
    'title'
  ];
  for (const selector of titleSelectors) {
    const el = $(selector).first();
    if (el.length > 0) {
      title = el.attr('content') || el.text() || '';
      title = title.trim();
      if (title.length > 10) break; // Found a substantial title
    }
  }
  
  // Fallback to title tag if nothing found
  if (!title || title.length < 10) {
    title = $('title').text() || $('h1').first().text() || '';
    title = title.trim();
  }
  
  // Try to extract author
  let author: string | undefined;
  const authorSelectors = [
    '[rel="author"]',
    '.author',
    '[itemprop="author"]',
    'meta[name="author"]'
  ];
  for (const selector of authorSelectors) {
    const authorEl = $(selector).first();
    if (authorEl.length > 0) {
      author = authorEl.text() || authorEl.attr('content');
      if (author) break;
    }
  }
  
  // Try to extract date
  let date: string | undefined;
  const dateSelectors = [
    'time[datetime]',
    '[itemprop="datePublished"]',
    'meta[itemprop="datePublished"]',
    'meta[property="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[name="article:published_time"]',
    'meta[name="publish-date"]',
    'meta[name="date"]',
    'meta[name="dc.date"]',
    'meta[name="dc.date.issued"]',
    'meta[name="dcterms.date"]',
    'meta[name="dcterms.created"]',
    'meta[name="sailthru.date"]',
    'meta[name="parsely-pub-date"]'
  ];
  for (const selector of dateSelectors) {
    const dateEl = $(selector).first();
    if (dateEl.length > 0) {
      date = dateEl.attr('datetime') || dateEl.attr('content') || dateEl.text();
      if (date) break;
    }
  }

  if (!date) {
    date = extractDateFromJsonLd($);
  }
  
  return { text: content, title, author, date };
}

/**
 * Returns true if more than 80% of characters in `text` are ASCII.
 * Used to filter out non-English articles before adding them to the pool.
 * This is deliberately loose — Nordic/French articles with a few accented
 * characters still pass; fully Cyrillic/CJK pages do not.
 */
function isEnglish(text: string): boolean {
  const asciiChars = text.split('').filter(c => c.charCodeAt(0) < 128).length;
  return asciiChars / text.length > 0.8;
}

export const PAYWALL_PATTERNS = [
  /login required/i,
  /subscribe to/i,
  /sign up to read/i,
  /premium content/i,
  /subscription required/i,
  /unlock this article/i,
  /free articles remaining/i,
  /article limit reached/i,
  /meter/i
];

export const PAYWALL_HTML_MARKERS = [
  'paywall',
  'subscription',
  'meter',
  'premium',
  'locked',
  'subscribe',
  'sign in to continue'
];

const NON_ARTICLE_PATTERNS = [
    /^404/i,
    /not found/i,
    /access denied/i,
    /cookie policy/i,
    /privacy policy/i,
    /terms of service/i,
    // Cookie/privacy consent pages (English)
    /your privacy choices/i,
    /accept.*cookies/i,
    /cookie consent/i,
    /privacy settings/i,
    // Cookie/privacy consent pages (Danish)
    /dine privatlivsvalg/i,
    /acceptér alle/i,
    /afvis alle/i,
    /cookiepolitik/i,
    /privatlivspolitik/i,
    /samtykke/i
];

/**
 * Scans extracted article text for patterns that indicate a paywall or login
 * gate. This is the second paywall detection pass (the first happens on the
 * HTTP response status in `fetchHtml`).
 */
export function detectPaywallInText(text: string): { isPaywalled: boolean; reason?: string } {
  for (const pattern of PAYWALL_PATTERNS) {
    if (pattern.test(text)) {
      return { isPaywalled: true, reason: `Text pattern: ${pattern.source}` };
    }
  }
  return { isPaywalled: false };
}

function detectNonArticleReason(text: string): "notArticle" | null {
  for (const pattern of NON_ARTICLE_PATTERNS) {
    if (pattern.test(text)) return "notArticle";
  }
  return null;
}

function isArticle(text: string): boolean {
  return detectNonArticleReason(text) === null;
}

/**
 * Returns true if the URL path contains a segment that strongly suggests
 * editorial content (`/news/`, `/blog/`, `/insights/`, etc.). Used as a
 * tiebreaker when the page itself doesn't declare an Article JSON-LD type.
 */
function urlLooksLikeArticle(url: string): boolean {
  return /\/(news|blog|insights|article|stories|press)\//i.test(url);
}

function hasJsonLdArticleType(html: string): boolean {
  try {
    const $ = cheerio.load(html);
    const scripts = $('script[type="application/ld+json"]');
    if (scripts.length === 0) return false;
    const validTypes = new Set(['Article', 'NewsArticle', 'BlogPosting']);

    const containsType = (obj: unknown): boolean => {
      if (!obj || typeof obj !== 'object') return false;
      const asRecord = obj as Record<string, unknown>;
      const type = asRecord['@type'];
      if (typeof type === 'string' && validTypes.has(type)) return true;
      if (Array.isArray(type) && type.some(t => typeof t === 'string' && validTypes.has(t))) return true;

      const graph = asRecord['@graph'];
      if (Array.isArray(graph)) {
        return graph.some(item => containsType(item));
      }

      return false;
    };

    for (const el of scripts.toArray()) {
      const raw = $(el).text();
      if (!raw || raw.trim().length === 0) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (parsed.some(item => containsType(item))) return true;
        } else if (containsType(parsed)) {
          return true;
        }
      } catch {
        // Ignore malformed JSON-LD blocks
      }
    }
  } catch {
    return false;
  }

  return false;
}

type ExtractionStats = {
  byTopic: Record<SearchResult['topic'], {
    fetched_ok: number;
    extracted_ok: number;
    excluded: {
      nonEnglish: number;
      tooShort: number;
      notArticle: number;
      paywalled: number;
      notLikelyArticle: number;
    };
  }>;
};

function initExtractionStats(): ExtractionStats {
  return {
    byTopic: {
      "AI_and_Strategy": {
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0, notLikelyArticle: 0 }
      },
      "Ecommerce_Retail_Tech": {
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0, notLikelyArticle: 0 }
      },
      "Luxury_and_Consumer": {
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0, notLikelyArticle: 0 }
      },
      "Jewellery_Industry": {
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0, notLikelyArticle: 0 }
      }
    }
  };
}

async function extractArticle(
  searchResult: SearchResult,
  fetchDir: string,
  extractedDir: string,
  stats: ExtractionStats,
  options?: ExtractPublishedAtOptions
): Promise<ExtractedArticle | null> {
  const hash = hashUrl(searchResult.url);
  const extractedPath = path.join(extractedDir, `${hash}.json`);

  // Check cache
  try {
    const cached = JSON.parse(await fs.readFile(extractedPath, 'utf-8'));
    return cached;
  } catch {
    // Continue to extract
  }

  try {
    // Wrap entire extraction with timeout (30 seconds total per article)
    return await withTimeout(
      (async () => {
        const isConsultancy = isConsultancyDomain(searchResult.domain);
        const isPlatform = isPlatformDomain(searchResult.domain);
        let text: string;
        let extractedTitle: string;
        let author: string | undefined;
        let htmlForDate: string | null = null;
        let htmlDateResult: ReturnType<typeof extractPublishedAtFromHtml> | null = null;
        let tavilyDateResult: ReturnType<typeof normalizePublishedAt> | null = null;

        let paywallStatus: 'not_paywalled' | 'likely_paywalled' | 'unknown' = 'unknown';
        let paywallReason: string | undefined;

        // For consultancy/platform domains, try Tavily extraction first (more reliable)
        if (isConsultancy || isPlatform) {
          console.log(`[Extract] Using Tavily extraction for ${isConsultancy ? 'consultancy' : 'platform'} domain: ${searchResult.url}`);
          const tavilyResult = await extractWithTavily(searchResult.url);
          
          if (tavilyResult && tavilyResult.content) {
            text = tavilyResult.content;
            extractedTitle = tavilyResult.title || searchResult.title;
            if (tavilyResult.publishedDate) {
              tavilyDateResult = normalizePublishedAt(tavilyResult.publishedDate, options);
            }
            author = undefined;
            paywallStatus = 'not_paywalled'; // Tavily extraction usually bypasses paywalls
            stats.byTopic[searchResult.topic].fetched_ok += 1;
          } else {
            // Fallback to regular HTML fetch if Tavily fails
            console.log(`[Extract] Tavily extraction failed, falling back to HTML fetch: ${searchResult.url}`);
            const fetchResult = await fetchHtml(searchResult.url, fetchDir);
            if (!fetchResult.html) {
              // If fetch failed due to paywall, mark it but still try to return article if we have snippet
              if (fetchResult.paywallStatus === 'likely_paywalled') {
                paywallStatus = 'likely_paywalled';
                paywallReason = fetchResult.paywallReason;
                // Don't return null - allow article with paywall status
                text = searchResult.snippet || '';
                extractedTitle = searchResult.title;
              } else {
                return null;
              }
            } else {
              if (!urlLooksLikeArticle(searchResult.url) && !hasJsonLdArticleType(fetchResult.html)) {
                stats.byTopic[searchResult.topic].excluded.notLikelyArticle += 1;
                return null;
              }
              stats.byTopic[searchResult.topic].fetched_ok += 1;
              paywallStatus = fetchResult.paywallStatus;
              paywallReason = fetchResult.paywallReason;

              const extractPromise = Promise.resolve(extractText(fetchResult.html, searchResult.url));
              const extracted = await withTimeout(
                extractPromise,
                5000,
                `Text extraction processing timeout for ${searchResult.url}`
              );
              text = extracted.text;
              extractedTitle = extracted.title;
              author = extracted.author;
              htmlForDate = fetchResult.html;
            }
          }
        } else {
          // Regular extraction for non-consultancy domains
          const fetchResult = await fetchHtml(searchResult.url, fetchDir);
          if (!fetchResult.html) {
            // If fetch failed due to paywall, mark it but still try to return article if we have snippet
            if (fetchResult.paywallStatus === 'likely_paywalled') {
              paywallStatus = 'likely_paywalled';
              paywallReason = fetchResult.paywallReason;
              // Don't return null - allow article with paywall status
              text = searchResult.snippet || '';
              extractedTitle = searchResult.title;
            } else {
              return null;
            }
          } else {
            if (!urlLooksLikeArticle(searchResult.url) && !hasJsonLdArticleType(fetchResult.html)) {
              stats.byTopic[searchResult.topic].excluded.notLikelyArticle += 1;
              return null;
            }
            stats.byTopic[searchResult.topic].fetched_ok += 1;
            paywallStatus = fetchResult.paywallStatus;
            paywallReason = fetchResult.paywallReason;

            const extractPromise = Promise.resolve(extractText(fetchResult.html, searchResult.url));
            const extracted = await withTimeout(
              extractPromise,
              5000,
              `Text extraction processing timeout for ${searchResult.url}`
            );
            text = extracted.text;
            extractedTitle = extracted.title;
            author = extracted.author;
            htmlForDate = fetchResult.html;
          }
        }
        
        // Validate extracted title - prefer search result title if extracted title looks suspicious
        let finalTitle = extractedTitle;
        
        // Check if extracted title is suspicious (non-English, cookie/privacy related)
        const isSuspiciousTitle = (title: string): boolean => {
          if (title.length < 10) return true;
          
          // Check for cookie/privacy consent keywords (English and Danish)
          const suspiciousKeywords = [
            'privacy choices', 'privatlivsvalg', 'cookie', 'cookies', 'samtykke',
            'accept', 'acceptér', 'reject', 'afvis', 'privacy policy', 'cookie policy',
            'privatlivspolitik', 'cookiepolitik'
          ];
          const lowerTitle = title.toLowerCase();
          if (suspiciousKeywords.some(keyword => lowerTitle.includes(keyword))) {
            return true;
          }
          
          // Check if title is non-English (simple heuristic: check for non-ASCII characters)
          // Danish uses mostly ASCII but has special chars (æ, ø, å) - if title has these, it's likely Danish
          const danishChars = /[æøåÆØÅ]/;
          if (danishChars.test(title)) {
            return true;
          }
          
          // Check if title doesn't match search result snippet (title should be related to snippet)
          // If extracted title is very different from search result title, it's suspicious
          if (searchResult.title && searchResult.title.length > 10) {
            const extractedLower = title.toLowerCase();
            const searchLower = searchResult.title.toLowerCase();
            // If they share less than 30% of words, it's suspicious
            const extractedWords = extractedLower.split(/\s+/).filter(w => w.length > 2);
            const searchWords = searchLower.split(/\s+/).filter(w => w.length > 2);
            const commonWords = extractedWords.filter(w => searchWords.includes(w));
            if (extractedWords.length > 0 && commonWords.length / extractedWords.length < 0.3) {
              return true;
            }
          }
          
          return false;
        };
        
        if (isSuspiciousTitle(extractedTitle) && searchResult.title && searchResult.title.length > 10) {
          console.warn(`[Extract] Suspicious title "${extractedTitle}", using search result title: ${searchResult.url}`);
          finalTitle = searchResult.title;
        } else if (extractedTitle.length < 10) {
          finalTitle = searchResult.title;
        }
        
        // Count words
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        
        // Check for paywall in text content (if not already detected)
        if (paywallStatus === 'unknown' || paywallStatus === 'not_paywalled') {
          const textPaywallCheck = detectPaywallInText(text);
          if (textPaywallCheck.isPaywalled) {
            paywallStatus = 'likely_paywalled';
            paywallReason = textPaywallCheck.reason;
          }
        }

        // If word count is very low after extraction, likely paywalled
        if (wordCount < 200 && paywallStatus === 'unknown') {
          paywallStatus = 'likely_paywalled';
          paywallReason = `Only ${wordCount} words extracted (minimum 200)`;
        }
        
        // Validate
        if (!isEnglish(text)) {
          console.warn(`[Extract] Non-English content: ${searchResult.url}`);
          stats.byTopic[searchResult.topic].excluded.nonEnglish += 1;
          return null;
        }
        
        if (wordCount < 200) {
          // Don't exclude paywalled articles - mark them but allow through
          if (paywallStatus === 'likely_paywalled') {
            console.warn(`[Extract] Paywalled article (${wordCount} words): ${searchResult.url}`);
            // Continue - don't exclude
          } else {
            console.warn(`[Extract] Too short (${wordCount} words): ${searchResult.url}`);
            stats.byTopic[searchResult.topic].excluded.tooShort += 1;
            return null;
          }
        }

        const nonArticleReason = detectNonArticleReason(text);
        if (nonArticleReason === "notArticle") {
          stats.byTopic[searchResult.topic].excluded.notArticle += 1;
          console.warn(`[Extract] Not an article (${wordCount} words): ${searchResult.url}`);
          return null;
        }

        if (!isArticle(text)) {
          stats.byTopic[searchResult.topic].excluded.notArticle += 1;
          console.warn(`[Extract] Not an article (${wordCount} words): ${searchResult.url}`);
          return null;
        }

        if (htmlForDate) {
          const domainRule = getDomainRule(searchResult.domain);
          htmlDateResult = extractPublishedAtFromHtml(htmlForDate, {
            ...options,
            domainRule
          });
        }
        const searchResultDate = searchResult.publishedDate
          ? normalizePublishedAt(searchResult.publishedDate, options)
          : null;

        const dateResult = (htmlDateResult && htmlDateResult.publishedAt)
          ? htmlDateResult
          : (tavilyDateResult && tavilyDateResult.publishedAt)
            ? tavilyDateResult
            : (searchResultDate && searchResultDate.publishedAt)
              ? searchResultDate
              : { publishedAt: null, rawValue: undefined, source: 'none' as const, sourceDetail: 'none' as const, confidence: 'low' as const };

        const discoveredAt = new Date().toISOString();
        const publishedAt = dateResult.publishedAt;

        const extracted: ExtractedArticle = {
          url: searchResult.url,
          title: finalTitle,
          snippet: searchResult.snippet,
          domain: searchResult.domain,
          publishedDate: publishedAt || undefined,
          publishedAt: publishedAt || null,
          publishedDateRaw: dateResult.rawValue,
          publishedDateInvalid: !publishedAt,
          dateSource: dateResult.source,
          dateSourceDetail: dateResult.sourceDetail,
          dateConfidence: dateResult.confidence,
          extractedText: text.substring(0, 5000), // Limit extracted text length
          wordCount,
          author,
          hash,
          topic: searchResult.topic,
          discoveredAt,
          sourceType: isConsultancy ? 'consultancy' : isPlatform ? 'platform' : 'discovery',
          paywallStatus,
          paywallReason
        };

        // Save to cache
        await fs.mkdir(extractedDir, { recursive: true });
        await fs.writeFile(extractedPath, JSON.stringify(extracted, null, 2), 'utf-8');

        stats.byTopic[searchResult.topic].extracted_ok += 1;
        return extracted;
      })(),
      30000, // 30 second total timeout per article
      `Article extraction timeout for ${searchResult.url}`
    );
  } catch (error: any) {
    console.warn(`[Extract] Error extracting ${searchResult.url}: ${error.message}`);
    return null;
  }
}

export async function fetchAndExtractArticles(
  searchResults: SearchResult[],
  discoveryDir: string,
  options?: ExtractPublishedAtOptions
): Promise<{ articles: ExtractedArticle[]; stats: ExtractionStats }> {
  const candidatesPath = path.join(discoveryDir, 'candidates.json');
  const statsPath = path.join(discoveryDir, 'extraction-report.json');
  const fetchDir = path.join(discoveryDir, 'fetch');
  const extractedDir = path.join(discoveryDir, 'extracted');

  // Check if candidates already exist
  try {
    const existing = JSON.parse(await fs.readFile(candidatesPath, 'utf-8'));
    const hasTopic = Array.isArray(existing) && existing.every(item => item.topic);
    if (!hasTopic) {
      console.warn(`[Extract] Cached candidates missing topic metadata. Re-extracting.`);
      throw new Error('Cached candidates missing topic');
    }
    console.log(`[Extract] Using cached candidates from ${candidatesPath}`);
    try {
      const cachedStats = JSON.parse(await fs.readFile(statsPath, 'utf-8'));
      return { articles: existing, stats: cachedStats };
    } catch {
      const fallbackStats = initExtractionStats();
      for (const item of existing) {
        const topic = item.topic as SearchResult['topic'] | undefined;
        if (topic && fallbackStats.byTopic[topic]) {
          fallbackStats.byTopic[topic].extracted_ok += 1;
        }
      }
      return { articles: existing, stats: fallbackStats };
    }
  } catch {
    // Continue to extract
  }

  const extracted: ExtractedArticle[] = [];
  const stats = initExtractionStats();
  const progressPath = path.join(discoveryDir, 'extraction-progress.json');

  // Try to load progress if exists (for resuming)
  let processedHashes = new Set<string>();
  try {
    const progress = JSON.parse(await fs.readFile(progressPath, 'utf-8'));
    if (Array.isArray(progress.processedHashes)) {
      processedHashes = new Set(progress.processedHashes);
      console.log(`[Extract] Resuming: ${processedHashes.size} articles already processed`);
    }
  } catch {
    // No progress file, start fresh
  }

  for (let i = 0; i < searchResults.length; i++) {
    const result = searchResults[i];
    const hash = hashUrl(result.url);
    
    // Skip if already processed
    if (processedHashes.has(hash)) {
      // Try to load from cache
      try {
        const cached = JSON.parse(await fs.readFile(path.join(extractedDir, `${hash}.json`), 'utf-8'));
        extracted.push(cached);
        continue;
      } catch {
        // Cache missing, reprocess
      }
    }

    console.log(`[Extract] Processing ${i + 1}/${searchResults.length}: ${result.title.substring(0, 50)}...`);
    
    try {
      const article = await extractArticle(result, fetchDir, extractedDir, stats, options);
      if (article) {
        extracted.push(article);
      }
      
      // Mark as processed
      processedHashes.add(hash);
      
      // Save progress every 10 articles
      if ((i + 1) % 10 === 0) {
        await fs.writeFile(progressPath, JSON.stringify({
          processedHashes: Array.from(processedHashes),
          lastProcessed: i + 1,
          total: searchResults.length
        }, null, 2), 'utf-8');
      }
    } catch (error: any) {
      console.error(`[Extract] Failed to process ${result.url}: ${error.message}`);
      // Continue to next article instead of stopping
    }
    
    // Rate limiting
    if (i < searchResults.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Save candidates
  await fs.mkdir(discoveryDir, { recursive: true });
  await fs.writeFile(candidatesPath, JSON.stringify(extracted, null, 2), 'utf-8');
  await fs.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
  
  // Clean up progress file
  try {
    await fs.unlink(progressPath);
  } catch {
    // Ignore if doesn't exist
  }

  return { articles: extracted, stats };
}

