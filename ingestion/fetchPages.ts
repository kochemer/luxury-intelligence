/**
 * fetchPages.ts
 *
 * 
 * This module provides utilities to fetch and extract articles from web pages
 * defined in the SOURCE_PAGES list, parse HTML using cheerio, and standardize their data
 * for ingestion and storage.
 *
 * - Imports dependencies for web scraping (cheerio), URL handling, hashing article URLs,
 *   and filesystem I/O.
 * - Relies on a shared type definition for Article and SourcePage.
 * - Final output is a normalized list of newly ingested Article objects saved to disk.
 * Output is saved to the local file at DATA_PATH, typically: ../data/articles.json
 */

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
  if (!dateStr || dateStr.trim().length === 0) return null;
  
  const trimmed = dateStr.trim();
  
  // Handle relative dates if hint is "RELATIVE"
  if (hint === "RELATIVE") {
    // Parse relative dates: "X hours ago", "X days ago", "X weeks ago", etc.
    const relativeMatch = trimmed.match(/^(\d+)\s+(hour|hours|day|days|week|weeks|month|months)\s+ago$/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      const now = new Date();
      
      if (unit.startsWith('hour')) {
        now.setHours(now.getHours() - amount);
      } else if (unit.startsWith('day')) {
        now.setDate(now.getDate() - amount);
      } else if (unit.startsWith('week')) {
        now.setDate(now.getDate() - (amount * 7));
      } else if (unit.startsWith('month')) {
        now.setMonth(now.getMonth() - amount);
      }
      
      return now.toISOString();
    }
    
    // Also handle "X days ago" without "ago" (e.g., "7 days ago" -> "7 days")
    const daysMatch = trimmed.match(/^(\d+)\s+days?$/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date.toISOString();
    }
  }
  
  // Try parsing absolute dates like "01 January 2026" or "D MMMM YYYY" format
  if (hint === "D MMMM YYYY" || hint === "RELATIVE") {
    // Try Luxon-style parsing for "01 January 2026"
    const absoluteMatch = trimmed.match(/^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i);
    if (absoluteMatch) {
      const day = parseInt(absoluteMatch[1], 10);
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const month = monthNames.indexOf(absoluteMatch[2].toLowerCase());
      const year = parseInt(absoluteMatch[3], 10);
      if (month >= 0) {
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
    }
  }
  
  // Try Date.parse for standard formats
  const ts = Date.parse(trimmed);
  if (!isNaN(ts)) return new Date(ts).toISOString();
  
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
    const itemsMatched = items.length;
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
        
        // If date selector is empty but hint is RELATIVE, try to find relative date in item text
        if (dateText.length === 0 && page.dateFormatHint === "RELATIVE") {
          const itemText = $(el).text();
          // Look for patterns like "X hours ago", "X days ago", "X weeks ago" in the item text
          const relativeDateMatch = itemText.match(/(\d+\s+(?:hour|hours|day|days|week|weeks|month|months)\s+ago)/i);
          if (relativeDateMatch) {
            dateText = relativeDateMatch[1];
          }
        }
        
        if (dateText.length > 0) {
          let parsed = bestEffortDate(dateText, page.dateFormatHint);
          if (parsed) published_at = parsed;
          else {
            // For RELATIVE hint, if parsing fails, try using current date as fallback
            if (page.dateFormatHint === "RELATIVE") {
              published_at = new Date().toISOString();
            } else {
              // skip this item (no valid date)
              return;
            }
          }
        } else {
          // For RELATIVE hint, allow items without dates (use current date as fallback)
          if (page.dateFormatHint === "RELATIVE") {
            published_at = new Date().toISOString();
          } else {
            // skip this item (no date found)
            return;
          }
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

    // Improved logging per instructions:
    const logObj = {
      status: res.status,
      itemsMatched,
      extractedCount: extracted.length,
      addedCount: addedThisPage
    };
    console.log(`[${page.name}] ${JSON.stringify(logObj)}`);

    // For BoF, print first 5 extracted { title, url, published_at }
    if (
      (page.name === 'BoF' || page.name.toLowerCase() === 'bof') &&
      extracted.length > 0
    ) {
      console.log(`[${page.name}] First 5 extracted:`);
      extracted.slice(0, 5).forEach((art, idx) => {
        const simple = {
          title: art.title,
          url: art.url,
          published_at: art.published_at
        };
        console.log(`  [${idx + 1}]`, simple);
      });
    }
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
