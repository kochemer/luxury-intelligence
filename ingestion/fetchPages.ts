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
import { addPageYield } from "./sourceYield.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "../data/articles.json");
const STATS_PATH = path.join(__dirname, "../data/page_source_stats.json");

// Statistics tracking structure
type SourceStats = {
  sourceName: string;
  pagesFetched: number;
  fetchStatus: number | null;
  itemsMatched: number;
  articlesExtracted: number;
  rejectedNoDate: number;
  rejectedInvalidDate: number;
  rejectedNoTitle: number;
  rejectedNoUrl: number;
  rejectedDuplicate: number;
  rejectedSelectorMiss: number;
  articlesKept: number;
  yieldPercentage: number; // (articlesKept / itemsMatched) * 100
  failures: Array<{
    url?: string;
    title?: string;
    reason: string;
  }>;
};

type PageIngestionStats = {
  timestamp: string;
  sources: SourceStats[];
  summary: {
    totalPagesFetched: number;
    totalItemsMatched: number;
    totalArticlesExtracted: number;
    totalArticlesKept: number;
    overallYieldPercentage: number;
  };
};

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

  // Initialize statistics tracking
  const sourceStats: SourceStats[] = [];
  const MAX_FAILURES_PER_SOURCE = 10; // Cap failure logs to avoid noise

  for (const page of SOURCE_PAGES) {
    // Initialize stats for this source
    const stats: SourceStats = {
      sourceName: page.name,
      pagesFetched: 0,
      fetchStatus: null,
      itemsMatched: 0,
      articlesExtracted: 0,
      rejectedNoDate: 0,
      rejectedInvalidDate: 0,
      rejectedNoTitle: 0,
      rejectedNoUrl: 0,
      rejectedDuplicate: 0,
      rejectedSelectorMiss: 0,
      articlesKept: 0,
      yieldPercentage: 0,
      failures: []
    };

    // Track page fetch
    stats.pagesFetched = 1;
    const res = await fetchWithHeaders(page.url);
    stats.fetchStatus = res.status;
    
    if (res.status !== 200) {
      console.log(`[${page.name}] ERROR: Fetch failed (status ${res.status})`);
      sourceStats.push(stats);
      continue;
    }
    if (!res.data || res.data.length === 0) {
      console.log(`[${page.name}] ERROR: No data received`);
      sourceStats.push(stats);
      continue;
    }
    const $ = cheerio.load(res.data);
    
    // Try primary selector first
    let items = $(page.selectors.item);
    let currentSelectors = page.selectors;
    
    // If primary selector finds 0 items and fallback exists, try fallback (BoF only)
    if (items.length === 0 && page.fallbackSelectors) {
      console.log(`[${page.name}] WARNING: Primary selector found 0 items, trying fallback selector`);
      items = $(page.fallbackSelectors.item);
      currentSelectors = page.fallbackSelectors;
      
      if (items.length === 0) {
        console.log(`[${page.name}] WARNING: Fallback selector also found 0 items, skipping this source`);
        sourceStats.push(stats);
        continue;
      } else {
        console.log(`[${page.name}] INFO: Fallback selector found ${items.length} items`);
      }
    }
    
    stats.itemsMatched = items.length;
    const itemsMatched = items.length;
    let extracted: Article[] = [];
    let addedThisPage = 0;
    
    items.each((i, el) => {
      // Title
      let title: string | undefined;
      if (currentSelectors.title) {
        title = $(el).find(currentSelectors.title).first().text().trim();
      } else if (currentSelectors.link) {
        // If no title selector but link selector exists, try to get title from link text
        const linkElem = $(el).find(currentSelectors.link).first();
        if (linkElem.length > 0) {
          title = linkElem.text().trim();
        }
      }
      
      // Link
      let linkElem = currentSelectors.link
        ? $(el).find(currentSelectors.link).first()
        : null;
      
      // For fallback selector case where item IS the link (e.g., "main h2 a")
      if (!linkElem || linkElem.length === 0) {
        // If the element itself is a link, use it
        if ($(el).is('a')) {
          linkElem = $(el);
        }
      }
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
      
      // Track selector misses
      if (!linkElem || linkElem.length === 0) {
        if (stats.failures.length < MAX_FAILURES_PER_SOURCE) {
          stats.failures.push({
            reason: "selector_miss_link",
            title: title || undefined
          });
        }
        stats.rejectedSelectorMiss++;
        return;
      }
      // Date
      let published_at: string | undefined = undefined;
      if (currentSelectors.date !== undefined) {
        let dateText = "";
        if (currentSelectors.date && currentSelectors.date.length > 0) {
          dateText = $(el).find(currentSelectors.date).first().text().trim();
        } else if (page.dateFormatHint === "D MMMM YYYY") {
          // BoF special case: date is in the next sibling text node after the link
          // Try multiple strategies to find the date
          if ($(el).is('a')) {
            // Item is the link (fallback case)
            // Strategy 1: Look for date in parent h2's next sibling text node
            const parentH2 = $(el).parent('h2');
            if (parentH2.length > 0) {
              const parentDomNode = parentH2[0] as any;
              const nextNode = parentDomNode.nextSibling;
              if (nextNode && nextNode.nodeType === 3) { // Text node
                dateText = nextNode.textContent?.trim() || "";
              }
              // Strategy 2: If no sibling, look in parent's text (excluding link text)
              if (!dateText) {
                const parentText = parentH2.text();
                const linkText = $(el).text();
                const remainingText = parentText.replace(linkText, '').trim();
                // Try to extract date pattern from remaining text
                const dateMatch = remainingText.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);
                if (dateMatch) {
                  dateText = dateMatch[1];
                }
              }
            }
          } else {
            // Item contains the link (primary case)
            // Strategy 1: Look for date in item's next sibling text node
            const itemDomNode = $(el)[0] as any;
            const nextNode = itemDomNode.nextSibling;
            if (nextNode && nextNode.nodeType === 3) { // Text node
              dateText = nextNode.textContent?.trim() || "";
            }
            // Strategy 2: Try link's next sibling
            if (!dateText && linkElem && linkElem.length > 0) {
              const linkDomNode = linkElem[0] as any;
              const linkNextNode = linkDomNode.nextSibling;
              if (linkNextNode && linkNextNode.nodeType === 3) {
                dateText = linkNextNode.textContent?.trim() || "";
              }
            }
            // Strategy 3: Look in item text (excluding link text)
            if (!dateText && linkElem && linkElem.length > 0) {
              const itemText = $(el).text();
              const linkText = linkElem.text();
              const remainingText = itemText.replace(linkText, '').trim();
              const dateMatch = remainingText.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);
              if (dateMatch) {
                dateText = dateMatch[1];
              }
            }
          }
        }
        
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
              // Track invalid date rejection
              if (stats.failures.length < MAX_FAILURES_PER_SOURCE) {
                stats.failures.push({
                  url: url || undefined,
                  title: title || undefined,
                  reason: `invalid_date_parse: "${dateText}"`
                });
              }
              stats.rejectedInvalidDate++;
              return;
            }
          }
        } else {
          // For RELATIVE hint or BoF with empty date selector, allow items without dates (use current date as fallback)
          if (page.dateFormatHint === "RELATIVE" || (currentSelectors.date === "" && page.dateFormatHint === "D MMMM YYYY")) {
            published_at = new Date().toISOString();
          } else {
            // Track no date rejection
            if (stats.failures.length < MAX_FAILURES_PER_SOURCE) {
              stats.failures.push({
                url: url || undefined,
                title: title || undefined,
                reason: "no_date_found"
              });
            }
            stats.rejectedNoDate++;
            return;
          }
        }
      }
      
      // Minimal validation with detailed tracking
      if (!url) {
        if (stats.failures.length < MAX_FAILURES_PER_SOURCE) {
          stats.failures.push({
            title: title || undefined,
            reason: "no_url"
          });
        }
        stats.rejectedNoUrl++;
        return;
      }
      if (!title) {
        if (stats.failures.length < MAX_FAILURES_PER_SOURCE) {
          stats.failures.push({
            url: url,
            reason: "no_title"
          });
        }
        stats.rejectedNoTitle++;
        return;
      }
      if (currentSelectors.date !== undefined && !published_at) {
        // For BoF with empty date selector, be lenient - use current date as fallback
        if (currentSelectors.date && currentSelectors.date.length > 0 && !published_at) {
          // Date selector is set but date not found - reject
          if (stats.failures.length < MAX_FAILURES_PER_SOURCE) {
            stats.failures.push({
              url: url,
              title: title,
              reason: "date_required_but_missing"
            });
          }
          stats.rejectedNoDate++;
          return;
        } else if (currentSelectors.date === "" && page.dateFormatHint === "D MMMM YYYY" && !published_at) {
          // BoF special case: empty date selector, date not found - use current date as fallback
          // This allows BoF articles to be ingested even if date parsing fails
          published_at = new Date().toISOString();
        }
      }
      
      // Check for duplicates
      if (seenUrls.has(url)) {
        stats.rejectedDuplicate++;
        return;
      }
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
      stats.articlesExtracted++;
    });

    // Update & log
    for (const art of extracted) {
      articles.push(art);
      addedThisPage++;
      stats.articlesKept++;
    }
    added += addedThisPage;

    // Calculate yield percentage
    if (stats.itemsMatched > 0) {
      stats.yieldPercentage = (stats.articlesKept / stats.itemsMatched) * 100;
    }

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
    
    // Add stats for this source
    sourceStats.push(stats);
    
    // Track yield for this page source
    const itemsFetched = stats.itemsMatched; // Items matched by selector
    const itemsParsed = stats.articlesExtracted; // Successfully extracted articles
    const newArticlesAdded = stats.articlesKept; // Articles actually added (not duplicates)
    const duplicates = stats.rejectedDuplicate; // Duplicate rejections
    
    addPageYield(
      page.name,
      itemsFetched,
      itemsParsed,
      newArticlesAdded,
      duplicates
    );
  }

  // Save back to file if any new
  if (added > 0) {
    await fs.writeFile(DATA_PATH, JSON.stringify(articles, null, 2), "utf8");
  }

  // Calculate summary statistics
  const totalPagesFetched = sourceStats.reduce((sum, s) => sum + s.pagesFetched, 0);
  const totalItemsMatched = sourceStats.reduce((sum, s) => sum + s.itemsMatched, 0);
  const totalArticlesExtracted = sourceStats.reduce((sum, s) => sum + s.articlesExtracted, 0);
  const totalArticlesKept = sourceStats.reduce((sum, s) => sum + s.articlesKept, 0);
  const overallYieldPercentage = totalItemsMatched > 0 
    ? (totalArticlesKept / totalItemsMatched) * 100 
    : 0;

  // Create final stats object
  const statsOutput: PageIngestionStats = {
    timestamp: new Date().toISOString(),
    sources: sourceStats,
    summary: {
      totalPagesFetched,
      totalItemsMatched,
      totalArticlesExtracted,
      totalArticlesKept,
      overallYieldPercentage
    }
  };

  // Write statistics to file
  await fs.writeFile(STATS_PATH, JSON.stringify(statsOutput, null, 2), "utf8");
  console.log(`\n[Stats] Page source statistics written to: ${STATS_PATH}`);

  return added;
}

// CLI runner - run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.includes('fetchPages.ts')) {
  runPageIngestion()
    .then(count => {
      console.log(`Added ${count} new articles`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Page ingestion failed:', err);
      process.exit(1);
    });
}
