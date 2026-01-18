import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { isConsultancyDomain } from '../discovery/consultancyDomains';
import { isPlatformDomain } from '../discovery/platformDomains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAVILY_EXTRACT_API_URL = 'https://api.tavily.com/extract';
const MAX_TEXT_LENGTH = 30000; // Hard cap: 30k characters per article
const MIN_WORD_COUNT = 200; // Minimum words to consider valid
const FETCH_TIMEOUT_MS = 15000; // 15 seconds per fetch
const EXTRACTION_TIMEOUT_MS = 5000; // 5 seconds for text extraction
const MAX_CONCURRENT = 2; // Rate limiting: max 2 concurrent fetches

export type EnrichedArticle = {
  url: string;
  title: string;
  extractedAt: string; // ISO timestamp
  wordCount: number;
  text: string;
  status: 'success' | 'failed' | 'paywalled' | 'tooShort' | 'extractionFailed';
  reason?: string; // Error message or reason for failure
};

export type ArticleInput = {
  url: string;
  title: string;
  source: string;
};

/**
 * Hash URL using SHA256 (same as discovery/fetchExtract.ts)
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
 * This is more reliable for consultancy/platform sites that block direct fetches
 */
async function extractWithTavily(url: string): Promise<{ content: string; title: string } | null> {
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
        extract_depth: 'advanced',
        include_images: false,
        chunks_per_source: 3,
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { results?: unknown[] } | unknown[];
    const results = Array.isArray(data) ? data
      : (data && typeof data === 'object' && Array.isArray((data as { results?: unknown[] }).results))
        ? (data as { results: unknown[] }).results : [];
    const first = results[0] as Record<string, unknown> | undefined;

    if (first) {
      const content = typeof first.content === 'string' ? first.content
        : typeof first.raw_content === 'string' ? first.raw_content
        : '';
      const title = typeof first.title === 'string' ? first.title : '';

      if (content && content.length >= 200) {
        return { content, title };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch HTML from URL with polite headers and caching
 */
async function fetchHtml(url: string, cacheDir: string): Promise<string | null> {
  const hash = hashUrl(url);
  const htmlPath = path.join(cacheDir, `${hash}.html`);

  // Check cache
  try {
    const cached = await fs.readFile(htmlPath, 'utf-8');
    return cached;
  } catch {
    // Continue to fetch
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
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

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      
      // Cache HTML
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(htmlPath, html, 'utf-8');
      
      return html;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Fetch timeout for ${url}`);
      }
      throw error;
    }
  } catch (error: any) {
    return null;
  }
}

/**
 * Extract readable text from HTML (reused from discovery/fetchExtract.ts)
 */
function extractText(html: string, url: string): { text: string; title: string } {
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
  
  // Extract title
  let title = $('title').text() || $('h1').first().text() || '';
  title = title.trim();
  
  return { text: content, title };
}

const PAYWALL_PATTERNS = [
  /login required/i,
  /subscribe to/i,
  /sign up to read/i,
  /premium content/i
];

const NON_ARTICLE_PATTERNS = [
  /^404/i,
  /not found/i,
  /access denied/i,
  /cookie policy/i,
  /privacy policy/i,
  /terms of service/i
];

/**
 * Detect if text is not an article by checking patterns in the first 20% of text
 * This prevents false positives from footer/navigation content
 */
function detectNonArticleReason(text: string): "paywalled" | "notArticle" | null {
  // Check paywall patterns in full text (paywalls can appear anywhere)
  for (const pattern of PAYWALL_PATTERNS) {
    if (pattern.test(text)) return "paywalled";
  }
  
  // For non-article patterns, only check the first 20% of text
  // This prevents false positives from footer/navigation content
  const textLength = text.length;
  const checkLength = Math.max(500, Math.floor(textLength * 0.2)); // At least 500 chars, or 20% of text
  const textToCheck = text.substring(0, checkLength);
  
  for (const pattern of NON_ARTICLE_PATTERNS) {
    if (pattern.test(textToCheck)) return "notArticle";
  }
  return null;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Enrich a single article with full text
 */
async function enrichArticle(
  article: ArticleInput,
  weekLabel: string,
  force: boolean
): Promise<EnrichedArticle> {
  const hash = hashUrl(article.url);
  const cacheDir = path.join(__dirname, '../data/weeks', weekLabel, 'podcast', 'fulltext');
  const cachePath = path.join(cacheDir, `${hash}.json`);

  // Check cache unless force
  if (!force) {
    try {
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8')) as EnrichedArticle;
      return cached;
    } catch {
      // Continue to fetch
    }
  }

  const extractedAt = new Date().toISOString();
  const domain = new URL(article.url).hostname.replace('www.', '');

  try {
    return await withTimeout(
      (async () => {
        const isConsultancy = isConsultancyDomain(domain);
        const isPlatform = isPlatformDomain(domain);
        let text: string;
        let extractedTitle: string;

        // For consultancy/platform domains, try Tavily extraction first
        if (isConsultancy || isPlatform) {
          const tavilyResult = await extractWithTavily(article.url);
          
          if (tavilyResult && tavilyResult.content) {
            text = tavilyResult.content;
            extractedTitle = tavilyResult.title || article.title;
          } else {
            // Fallback to HTML fetch
            const html = await fetchHtml(article.url, cacheDir);
            if (!html) {
              return {
                url: article.url,
                title: article.title,
                extractedAt,
                wordCount: 0,
                text: '',
                status: 'extractionFailed',
                reason: 'Failed to fetch HTML'
              };
            }

            const extracted = await withTimeout(
              Promise.resolve(extractText(html, article.url)),
              EXTRACTION_TIMEOUT_MS,
              `Text extraction timeout for ${article.url}`
            );
            text = extracted.text;
            extractedTitle = extracted.title;
          }
        } else {
          // Regular extraction
          const html = await fetchHtml(article.url, cacheDir);
          if (!html) {
            return {
              url: article.url,
              title: article.title,
              extractedAt,
              wordCount: 0,
              text: '',
              status: 'extractionFailed',
              reason: 'Failed to fetch HTML'
            };
          }

          const extracted = await withTimeout(
            Promise.resolve(extractText(html, article.url)),
            EXTRACTION_TIMEOUT_MS,
            `Text extraction timeout for ${article.url}`
          );
          text = extracted.text;
          extractedTitle = extracted.title;
        }

        // Apply filters
        const nonArticleReason = detectNonArticleReason(text);
        if (nonArticleReason) {
          const result: EnrichedArticle = {
            url: article.url,
            title: extractedTitle || article.title,
            extractedAt,
            wordCount: 0,
            text: '',
            status: nonArticleReason === 'paywalled' ? 'paywalled' : 'failed',
            reason: nonArticleReason
          };
          // Cache failed result to avoid retrying
          await fs.mkdir(cacheDir, { recursive: true });
          await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
          return result;
        }

        // Check minimum word count
        const wordCount = countWords(text);
        if (wordCount < MIN_WORD_COUNT) {
          const result: EnrichedArticle = {
            url: article.url,
            title: extractedTitle || article.title,
            extractedAt,
            wordCount,
            text: '',
            status: 'tooShort',
            reason: `Only ${wordCount} words (minimum ${MIN_WORD_COUNT})`
          };
          await fs.mkdir(cacheDir, { recursive: true });
          await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
          return result;
        }

        // Cap text length
        if (text.length > MAX_TEXT_LENGTH) {
          text = text.substring(0, MAX_TEXT_LENGTH) + '... [truncated]';
        }

        const result: EnrichedArticle = {
          url: article.url,
          title: extractedTitle || article.title,
          extractedAt,
          wordCount: countWords(text),
          text,
          status: 'success'
        };

        // Cache successful result
        await fs.mkdir(cacheDir, { recursive: true });
        await fs.writeFile(cachePath, JSON.stringify(result, null, 2));

        return result;
      })(),
      FETCH_TIMEOUT_MS + EXTRACTION_TIMEOUT_MS + 5000, // Total timeout
      `Enrichment timeout for ${article.url}`
    );
  } catch (error: any) {
    const result: EnrichedArticle = {
      url: article.url,
      title: article.title,
      extractedAt,
      wordCount: 0,
      text: '',
      status: 'extractionFailed',
      reason: error.message || 'Unknown error'
    };
    // Cache failed result
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
    } catch {
      // Ignore cache write errors
    }
    return result;
  }
}

/**
 * Process articles in batches with rate limiting
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Enrich articles with full text
 */
export async function enrichFullText(
  articles: ArticleInput[],
  weekLabel: string,
  options: {
    force?: boolean;
    topKPerCategory?: number;
  } = {}
): Promise<Map<string, EnrichedArticle>> {
  const { force = false, topKPerCategory } = options;
  
  // Limit articles if specified (though articles should already be filtered)
  const articlesToEnrich = topKPerCategory 
    ? articles.slice(0, topKPerCategory * 4) // 4 categories max
    : articles;

  console.log(`[Enrich] Enriching ${articlesToEnrich.length} articles with full text...`);

  // Process with rate limiting (max 2 concurrent)
  const enriched = await processBatch(
    articlesToEnrich,
    (article) => enrichArticle(article, weekLabel, force),
    MAX_CONCURRENT
  );

  // Build map
  const enrichedMap = new Map<string, EnrichedArticle>();
  let successCount = 0;
  let totalWords = 0;

  for (const result of enriched) {
    enrichedMap.set(result.url, result);
    if (result.status === 'success') {
      successCount++;
      totalWords += result.wordCount;
    }
  }

  console.log(`[Enrich] Full text available for ${successCount}/${articlesToEnrich.length} articles (${totalWords.toLocaleString()} total words)`);
  
  if (successCount < articlesToEnrich.length) {
    const failed = enriched.filter(r => r.status !== 'success');
    const reasons = new Map<string, number>();
    for (const f of failed) {
      const reason = f.reason || f.status;
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
    }
    console.log(`[Enrich] Failed: ${Array.from(reasons.entries()).map(([r, c]) => `${r}: ${c}`).join(', ')}`);
  }

  return enrichedMap;
}
