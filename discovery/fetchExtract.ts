import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { SearchResult } from './searchProvider';
import { isConsultancyDomain } from './consultancyDomains';
import { isPlatformDomain } from './platformDomains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAVILY_EXTRACT_API_URL = 'https://api.tavily.com/extract';

export type ExtractedArticle = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
  publishedDateInvalid?: boolean; // True if publishedDate is invalid/missing
  extractedText: string;
  wordCount: number;
  author?: string;
  hash: string;
  topic: SearchResult['topic'];
  discoveredAt?: string; // ISO timestamp when article was discovered/extracted
  sourceType?: 'discovery' | 'consultancy' | 'platform'; // Tag consultancy/platform articles
  paywallStatus?: 'not_paywalled' | 'likely_paywalled' | 'unknown'; // Paywall detection status
  paywallReason?: string; // Reason for paywall status
};

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

function extractText(html: string, url: string): { text: string; title: string; author?: string; date?: string } {
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
    'meta[property="article:published_time"]',
    'meta[name="publish-date"]'
  ];
  for (const selector of dateSelectors) {
    const dateEl = $(selector).first();
    if (dateEl.length > 0) {
      date = dateEl.attr('datetime') || dateEl.attr('content') || dateEl.text();
      if (date) break;
    }
  }
  
  return { text: content, title, author, date };
}

function isEnglish(text: string): boolean {
  // Simple heuristic: check if >80% of characters are ASCII
  const asciiChars = text.split('').filter(c => c.charCodeAt(0) < 128).length;
  return asciiChars / text.length > 0.8;
}

/**
 * Validate and normalize published date
 * Returns: { valid: boolean, date: string | null, invalid: boolean }
 */
function validatePublishedDate(dateStr: string | undefined | null): { valid: boolean; date: string | null; invalid: boolean } {
  if (!dateStr || dateStr.trim() === '') {
    return { valid: false, date: null, invalid: true };
  }

  try {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      return { valid: false, date: null, invalid: true };
    }

    const year = parsed.getFullYear();
    const currentYear = new Date().getFullYear();
    
    // Invalid if year is before 2015 (too old) or more than 1 year in future
    if (year < 2015 || year > currentYear + 1) {
      return { valid: false, date: null, invalid: true };
    }

    return { valid: true, date: parsed.toISOString(), invalid: false };
  } catch {
    return { valid: false, date: null, invalid: true };
  }
}

const PAYWALL_PATTERNS = [
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

const PAYWALL_HTML_MARKERS = [
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
    /terms of service/i
];

function detectPaywallInText(text: string): { isPaywalled: boolean; reason?: string } {
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

type ExtractionStats = {
  byTopic: Record<SearchResult['topic'], {
    fetched_ok: number;
    extracted_ok: number;
    excluded: {
      nonEnglish: number;
      tooShort: number;
      notArticle: number;
      paywalled: number;
    };
  }>;
};

function initExtractionStats(): ExtractionStats {
  return {
    byTopic: {
      "AI_and_Strategy": {
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0 }
      },
      "Ecommerce_Retail_Tech": {
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0 }
      },
      "Luxury_and_Consumer": {
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0 }
      },
      "Jewellery_Industry": {
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0 }
      }
    }
  };
}

async function extractArticle(
  searchResult: SearchResult,
  fetchDir: string,
  extractedDir: string,
  stats: ExtractionStats
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
        let date: string | undefined;

        let paywallStatus: 'not_paywalled' | 'likely_paywalled' | 'unknown' = 'unknown';
        let paywallReason: string | undefined;

        // For consultancy/platform domains, try Tavily extraction first (more reliable)
        if (isConsultancy || isPlatform) {
          console.log(`[Extract] Using Tavily extraction for ${isConsultancy ? 'consultancy' : 'platform'} domain: ${searchResult.url}`);
          const tavilyResult = await extractWithTavily(searchResult.url);
          
          if (tavilyResult && tavilyResult.content) {
            text = tavilyResult.content;
            extractedTitle = tavilyResult.title || searchResult.title;
            date = tavilyResult.publishedDate;
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
              date = extracted.date;
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
            date = extracted.date;
          }
        }
        
        // Use search result title if extracted title is too short
        const finalTitle = extractedTitle.length > 10 ? extractedTitle : searchResult.title;
        
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

        // Validate published date
        const rawDate = date || searchResult.publishedDate;
        const dateValidation = validatePublishedDate(rawDate);
        const discoveredAt = new Date().toISOString();

        const extracted: ExtractedArticle = {
          url: searchResult.url,
          title: finalTitle,
          snippet: searchResult.snippet,
          domain: searchResult.domain,
          publishedDate: dateValidation.date || undefined,
          publishedDateInvalid: dateValidation.invalid,
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
  discoveryDir: string
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
      const article = await extractArticle(result, fetchDir, extractedDir, stats);
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

