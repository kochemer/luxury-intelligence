import Parser from 'rss-parser';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SOURCE_FEEDS } from './sources.js';
import type { Article } from './types.js';
import { addRssYield } from './sourceYield.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, '../data/articles.json');

// Generate a simple stable hash for IDs (djb2 string hash)
function hashString(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

async function loadArticles(): Promise<Article[]> {
  try {
    const buf = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(buf);
  } catch (err) {
    // If file does not exist, start with empty
    return [];
  }
}

async function saveArticles(articles: Article[]) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(articles, null, 2), 'utf-8');
}

export type RssFeedStats = {
  sourceName: string;
  itemsProcessed: number;
  newArticles: number;
  categoryHint?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a feed with retry-and-backoff on transient failures. Some publishers
 * (e.g. Business of Fashion) sit behind Cloudflare and intermittently return
 * 403/429 to rapid automated requests even with a browser User-Agent, yet serve
 * the feed fine on a retry a moment later. Retries 403 (bot-block), 429 (rate
 * limit), 5xx, and network errors; does NOT retry other statuses like 404.
 * Hard blocks (WatchPro, Professional Jeweller) still fail after retries — those
 * need alternate feed URLs, tracked in the ingestion backlog.
 */
async function fetchFeedWithRetry(
  url: string,
  headers: Record<string, string>,
  maxAttempts = 3
): Promise<Response> {
  let lastRes: Response | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 200 || attempt === maxAttempts) return res;
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        lastRes = res;
        await sleep(700 * attempt + Math.floor(Math.random() * 400));
        continue;
      }
      return res; // non-transient (e.g. 404) — don't retry
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(700 * attempt + Math.floor(Math.random() * 400));
    }
  }
  return lastRes as Response;
}

const PAGINATE_LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000;

/** Appends WordPress's `paged=N` to a feed URL. */
export function pagedFeedUrl(url: string, page: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}paged=${page}`;
}

/**
 * Bing News RSS links are click-tracking redirects
 * (`bing.com/news/apiclick.aspx?...&url=<encoded article URL>&...`). Returns the
 * real article URL so dedupe works against the publisher's own feed and the
 * digest links straight to the publisher. Other URLs pass through unchanged.
 */
export function unwrapBingNewsUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('bing.com') || !u.pathname.includes('apiclick')) return url;
    return u.searchParams.get('url') || url;
  } catch {
    return url;
  }
}

/**
 * Reads pages 2..`maxPages` of a WordPress feed so a weekly-scale backfill
 * survives feeds that only list their latest 10 items. Stops at the first
 * non-200, a page with no unseen links, or a page reaching items older than
 * the lookback. A failure on page N keeps pages 1..N-1.
 */
async function fetchExtraPages(
  parser: Parser,
  feedUrl: string,
  maxPages: number,
  headers: Record<string, string>,
  firstPageItems: Parser.Item[]
): Promise<Parser.Item[]> {
  const items: Parser.Item[] = [];
  const seen = new Set(firstPageItems.map(i => i.link));
  const cutoff = Date.now() - PAGINATE_LOOKBACK_MS;
  const reachedCutoff = (page: Parser.Item[]) =>
    page.some(i => new Date(i.isoDate || i.pubDate || 0).getTime() < cutoff);

  if (reachedCutoff(firstPageItems)) return items;
  for (let page = 2; page <= maxPages; page++) {
    try {
      const res = await fetchFeedWithRetry(pagedFeedUrl(feedUrl, page), headers, 2);
      if (res.status !== 200) break;
      const pageItems = (await parser.parseString(await res.text())).items || [];
      const fresh = pageItems.filter(i => i.link && !seen.has(i.link));
      if (fresh.length === 0) break;
      fresh.forEach(i => seen.add(i.link));
      items.push(...fresh);
      if (reachedCutoff(pageItems)) break;
    } catch {
      break;
    }
  }
  return items;
}

export async function runRssIngestion(): Promise<{ added: number; updated: number; feeds: RssFeedStats[] }> {
  const parser = new Parser();
  const allNewArticles: Article[] = [];
  let updatedCount = 0;
  const now = new Date().toISOString();
  const feedStats: RssFeedStats[] = [];

  let existingArticles = await loadArticles();
  // Use Map for easier updates
  const existingArticlesByUrl = new Map<string, Article>();
  for (const article of existingArticles) {
    existingArticlesByUrl.set(article.url, article);
  }

  for (const feed of SOURCE_FEEDS) {
    try {
      // Use fetch for diagnostics and custom headers
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9"
      };
      const res = await fetchFeedWithRetry(feed.url, headers);
      const status = res.status;
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      const byteLength = text.length;

      if (status !== 200) {
        throw new Error(`Failed to fetch feed "${feed.name}": status=${status}, content-type=${contentType}`);
      }

      let rss;
      try {
        rss = await parser.parseString(text);
      } catch (err) {
        console.error(`Parse failure for "${feed.name}". First 200 bytes:`, text.slice(0, 200));
        throw err;
      }
      let feedItemsProcessed = 0;
      let feedItemsMatched = 0;
      let feedItemsUpdated = 0;
      let feedItemsParsed = 0;
      let feedNewArticles = 0;

      const items = rss.items || [];
      if (feed.paginate && feed.paginate > 1) {
        const extra = await fetchExtraPages(parser, feed.url, feed.paginate, headers, items);
        if (extra.length > 0) console.log(`[${feed.name}] pagination added ${extra.length} older items`);
        items.push(...extra);
      }

      for (const item of items) {
        const title = item.title || '';
        const url = unwrapBingNewsUrl(item.link || '');
        const isoDate = item.isoDate || item.pubDate;
        if (!url || !title || !isoDate) continue;
        
        feedItemsProcessed++;
        feedItemsParsed++; // Successfully parsed item

        // Extract snippet from contentSnippet, content, or description
        const snippet = (item.contentSnippet || item.content || item.description || '').trim();
        // Limit snippet length to reasonable size (first 500 chars)
        const truncatedSnippet = snippet.length > 500 ? snippet.substring(0, 500) + '...' : snippet;

        const existingArticle = existingArticlesByUrl.get(url);
        if (existingArticle) {
          feedItemsMatched++;
          // Update existing article with snippet if it doesn't have one
          if (!existingArticle.snippet && truncatedSnippet) {
            existingArticle.snippet = truncatedSnippet;
            updatedCount++;
            feedItemsUpdated++;
          }
        } else {
          // New article
          const article: Article = {
            id: hashString(url),
            title,
            url,
            source: feed.name,
            published_at: new Date(isoDate).toISOString(),
            ingested_at: now,
            snippet: truncatedSnippet || undefined,
            sourceType: 'rss',
            // Store categoryHint in article metadata (if available)
            ...(feed.categoryHint ? { categoryHint: feed.categoryHint } : {}),
          };
          allNewArticles.push(article);
          feedNewArticles++;
          existingArticlesByUrl.set(url, article); // Prevent dupes within this run
        }
      }
      
      // Track yield for this RSS source
      const feedDuplicates = feedItemsMatched;
      addRssYield(
        feed.name,
        feedItemsProcessed, // itemsFetched
        feedItemsParsed,    // itemsParsed
        feedNewArticles,    // newArticlesAdded
        feedDuplicates      // duplicates
      );
      
      feedStats.push({
        sourceName: feed.name,
        itemsProcessed: feedItemsProcessed,
        newArticles: feedNewArticles,
        categoryHint: feed.categoryHint
      });

      if (feedItemsProcessed > 0) {
        console.log(`[${feed.name}] processed ${feedItemsProcessed} items, matched ${feedItemsMatched} existing, updated ${feedItemsUpdated} with snippets`);
      }
    } catch (err) {
      const message = (err as Error).message;
      console.warn(`Failed to fetch feed "${feed.name}": ${message}`);
      addRssYield(feed.name, 0, 0, 0, 0, message.slice(0, 200));
      continue;
    }
  }
  
  // Add new articles to existingArticles array before saving
  existingArticles.push(...allNewArticles);
  
  // Save if we have new articles or updates
  if (allNewArticles.length > 0 || updatedCount > 0) {
    await saveArticles(existingArticles);
  }
  
  return { added: allNewArticles.length, updated: updatedCount, feeds: feedStats };
}

// CLI runner - run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.includes('fetchRss.ts')) {
  runRssIngestion()
    .then(result => {
      console.log(`Added ${result.added} new articles, updated ${result.updated} existing articles with snippets`);
      process.exit(0);
    })
    .catch(err => {
      console.error('RSS ingestion failed:', err);
      process.exit(1);
    });
}
