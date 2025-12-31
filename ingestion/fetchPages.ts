import { SOURCE_PAGES } from "./sources";
import { Article, SourcePage } from "./types";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "../data/articles.json");

// Hash function (same as fetchRss uses: short base36 of md5 hex)
function hashString(input: string): string {
  const md5 = crypto.createHash("md5").update(input).digest("hex");
  // e.g. take first 9 digits as base-36
  return parseInt(md5.slice(0, 9), 16).toString(36);
}

function makeAbsoluteUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).toString();
  } catch {
    return relativeOrAbsolute;
  }
}

function bestEffortDate(dateStr: string, hint?: string): string | null {
  // Try Date.parse first
  const ts = Date.parse(dateStr);
  if (!isNaN(ts)) return new Date(ts).toISOString();
  // Could attempt to improve with hint, but just skip on error as per requirements
  return null;
}

async function fetchWithHeaders(url: string): Promise<{ status: number, data?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PageIngestBot/1.0; +https://example.com/)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!res.ok) {
      return { status: res.status };
    }
    const data = await res.text();
    return { status: res.status, data: data || undefined };
  } catch (e) {
    return { status: 0 };
  }
}

export async function runPageIngestion(): Promise<number> {
  // Load articles
  let articles: Article[] = [];
  let seenUrls = new Set<string>();
  let added = 0;
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    articles = JSON.parse(raw);
    for (const a of articles) seenUrls.add(a.url);
  } catch (e) {
    // If file not exists, assume empty
    articles = [];
  }

  for (const page of SOURCE_PAGES) {
    const res = await fetchWithHeaders(page.url);
    if (res.status !== 200) {
      console.log(`[${page.name}] ERROR: Fetch failed (status ${res.status})`);
      continue;
    }
    if (!res.data || res.data.length === 0) {
      console.log(`[${page.name}] ERROR: No data received`);
      continue;
    }
    const $ = cheerio.load(res.data);
    const items = $(page.selectors.item);
    let extracted: Article[] = [];
    let addedThisPage = 0;
    items.each((i, el) => {
      // Title
      let title: string | undefined;
      if (page.selectors.title) {
        title = $(el).find(page.selectors.title).first().text().trim();
      }
      // Link
      let linkElem = page.selectors.link
        ? $(el).find(page.selectors.link).first()
        : null;
      let url: string | undefined;
      if (linkElem && linkElem.length > 0) {
        const attr = page.linkAttr || "href";
        url = linkElem.attr(attr) || undefined;
        if (url) {
          url = makeAbsoluteUrl(url, page.url);
        }
      }
      // If title still missing, use link text
      if ((!title || title.length === 0) && linkElem && linkElem.length > 0) {
        title = linkElem.text().trim();
      }
      // Date
      let published_at: string | undefined = undefined;
      if (page.selectors.date) {
        let dateText = $(el).find(page.selectors.date).first().text().trim();
        if (dateText.length > 0) {
          let parsed = bestEffortDate(dateText, page.dateFormatHint);
          if (parsed) published_at = parsed;
          else {
            // skip this item (no valid date)
            return;
          }
        } else {
          // skip this item (no date found)
          return;
        }
      }
      // Minimal validation
      if (!url || !title || (page.selectors.date && !published_at)) {
        return;
      }
      if (seenUrls.has(url)) return;
      const article: Article = {
        id: hashString(url),
        title,
        url,
        source: page.name,
        published_at: published_at || "",
        ingested_at: new Date().toISOString()
      };
      seenUrls.add(url);
      extracted.push(article);
    });

    // Update & log
    for (const art of extracted) {
      articles.push(art);
      addedThisPage++;
    }
    added += addedThisPage;

    console.log(
      `[${page.name}] fetched status ${res.status}, extracted ${extracted.length} items, added ${addedThisPage}`
    );
  }

  // Save back to file if any new
  if (added > 0) {
    await fs.writeFile(DATA_PATH, JSON.stringify(articles, null, 2), "utf8");
  }
  return added;
}

// CLI runner - run if this file is executed directly
runPageIngestion()
  .then(count => {
    console.log(`Added ${count} new articles`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Page ingestion failed:', err);
    process.exit(1);
  });
