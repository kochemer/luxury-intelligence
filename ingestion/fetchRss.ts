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
};

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
      const res = await fetch(feed.url, { headers });
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
      
      for (const item of rss.items || []) {
        const title = item.title || '';
        const url = item.link || '';
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
        newArticles: feedNewArticles
      });

      if (feedItemsProcessed > 0) {
        console.log(`[${feed.name}] processed ${feedItemsProcessed} items, matched ${feedItemsMatched} existing, updated ${feedItemsUpdated} with snippets`);
      }
    } catch (err) {
      console.warn(`Failed to fetch feed "${feed.name}": ${(err as Error).message}`);
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
