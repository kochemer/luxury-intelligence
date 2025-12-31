import Parser from 'rss-parser';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SOURCE_FEEDS } from './sources.js';
import type { Article } from './types.js';

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

export async function runRssIngestion(): Promise<number> {
  const parser = new Parser();
  const allNewArticles: Article[] = [];
  const now = new Date().toISOString();

  let existingArticles = await loadArticles();
  const existingUrls = new Set(existingArticles.map(a => a.url));

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
      for (const item of rss.items || []) {
        const title = item.title || '';
        const url = item.link || '';
        const isoDate = item.isoDate || item.pubDate;
        if (!url || !title || !isoDate) continue;
        if (existingUrls.has(url)) continue;

        const article: Article = {
          id: hashString(url),
          title,
          url,
          source: feed.name,
          published_at: new Date(isoDate).toISOString(),
          ingested_at: now,
        };
        allNewArticles.push(article);
        existingUrls.add(url); // Prevent dupes within this run
      }
    } catch (err) {
      console.warn(`Failed to fetch feed "${feed.name}": ${(err as Error).message}`);
      continue;
    }
  }
  if (allNewArticles.length > 0) {
    await saveArticles([...existingArticles, ...allNewArticles]);
  }
  return allNewArticles.length;
}

// CLI runner - run if this file is executed directly
runRssIngestion()
  .then(count => {
    console.log(`Added ${count} new articles`);
    process.exit(0);
  })
  .catch(err => {
    console.error('RSS ingestion failed:', err);
    process.exit(1);
  });
