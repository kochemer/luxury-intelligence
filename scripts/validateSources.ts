// Validate sources: check feed and page health

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import Parser from "rss-parser";

import { SOURCE_FEEDS, SOURCE_PAGES } from "../ingestion/sources.js";
import type { SourceFeed, SourcePage } from "../ingestion/types.js";

// Helper to format dates ISO-strings cleanly
function formatDate(d: string | Date | undefined): string | null {
  if (!d) return null;
  try {
    let dd = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dd.getTime())) return null;
    return dd.toISOString();
  } catch {
    return null;
  }
}

async function checkFeed(feed: SourceFeed) {
  const parser = new Parser();
  let info: {
    source: string;
    url: string;
    status: string | null;
    items: number | null;
    contentType: string | null;
    newestDate: string | null;
    oldestDate: string | null;
    error: string | null;
  } = {
    source: feed.name,
    url: feed.url,
    status: null,
    items: null,
    contentType: null,
    newestDate: null,
    oldestDate: null,
    error: null
  };

  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/xml,application/rss+xml,application/xhtml+xml,text/xml;q=0.9,*/*;q=0.8"
      }
    });

    info.status = `${res.status} ${res.statusText}`;
    info.contentType = res.headers.get("content-type") ?? null;

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const txt = await res.text();

    let feedParsed;
    try {
      feedParsed = await parser.parseString(txt);
    } catch (e) {
      info.error = `Parse error: ${(e instanceof Error ? e.message : String(e))}`;
      return info;
    }

    const items = feedParsed.items ?? [];
    info.items = items.length;

    if (items.length > 0) {
      // Dates: search .pubDate or .isoDate or .published or .date
      let dates: Date[] = [];
      for (const it of items) {
        let d: string | undefined =
          it.pubDate || it.isoDate || it.published || it.date;
        if (d) {
          let dd = new Date(d);
          if (!isNaN(dd.getTime())) {
            dates.push(dd);
          }
        }
      }
      if (dates.length > 0) {
        info.newestDate = formatDate(new Date(Math.max(...dates.map(x => x.getTime()))));
        info.oldestDate = formatDate(new Date(Math.min(...dates.map(x => x.getTime()))));
      }
    }
  } catch (e) {
    info.error = (e instanceof Error ? e.message : String(e));
  }

  return info;
}

async function checkPage(page: SourcePage) {
  let info: {
    source: string;
    url: string;
    status: string | null;
    items: number | null;
    dates: number | null;
    titles: string[];
    error: string | null;
  } = {
    source: page.name,
    url: page.url,
    status: null,
    items: null,
    dates: null,
    titles: [],
    error: null
  };

  try {
    const res = await fetch(page.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    info.status = `${res.status} ${res.statusText}`;
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const html = await res.text();

    const $ = cheerio.load(html);
    const itemSel = page.selectors.item;
    const items = $(itemSel).toArray();
    info.items = items.length;

    let foundDates = 0;
    let sampleTitles = [];
    for (let i = 0; i < items.length; ++i) {
      const el = items[i];
      let title: string | null = null;
      if (page.selectors.title) {
        // Relative to item element
        const $title = $(el).find(page.selectors.title);
        title = $title.text().trim() || null;
      } else {
        // no title selector, try just link text
        const $link = $(el).find(page.selectors.link);
        title = $link.text().trim() || null;
      }
      if (title && sampleTitles.length < 3) sampleTitles.push(title);

      if (page.selectors.date) {
        let dateTxt = $(el).find(page.selectors.date).text().trim();
        if (dateTxt) {
          // Try to construct a valid date
          let d = new Date(dateTxt);
          if (!isNaN(d.getTime())) {
            foundDates++;
          }
        }
      }
    }
    info.dates = foundDates;
    info.titles = sampleTitles;
  } catch (e) {
    info.error = (e instanceof Error ? e.message : String(e));
  }
  return info;
}

// Print readable console table
function printFeedTable(results: any[], type = "Feed") {
  const header = type === "Feed"
    ? ["Source", "Status", "Items", "Newest", "Oldest", "Err"]
    : ["Source", "Status", "Items", "Dates", "Sample Titles", "Err"];

  console.log(`\n=== ${type} Validation Results ===`);
  console.log(header.join(" | "));
  console.log("-".repeat(header.join(" | ").length + 10));
  for (const r of results) {
    if (type === "Feed") {
      console.log([
        r.source,
        r.status ?? "",
        r.items ?? "",
        r.newestDate ?? "",
        r.oldestDate ?? "",
        r.error ? "ERR" : ""
      ].join(" | "));
    } else {
      console.log([
        r.source,
        r.status ?? "",
        r.items ?? "",
        r.dates ?? "",
        r.titles && r.titles.length > 0 ? r.titles.join("; ") : "",
        r.error ? "ERR" : ""
      ].join(" | "));
    }
  }
}

async function validateAll() {
  // Validate feeds
  const feedResults = [];
  for (const f of SOURCE_FEEDS) {
    const res = await checkFeed(f);
    feedResults.push(res);
  }
  printFeedTable(feedResults, "Feed");

  // Validate pages
  const pageResults = [];
  for (const p of SOURCE_PAGES) {
    const res = await checkPage(p);
    pageResults.push(res);
  }
  printFeedTable(pageResults, "Page");

  // Write to JSON file
  const health = {
    feeds: feedResults,
    pages: pageResults,
    generatedAt: new Date().toISOString()
  };
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "source_health.json"), JSON.stringify(health, null, 2), "utf8");
  console.log(`\nSaved JSON health report to data/source_health.json`);
}

// CLI runner
validateAll()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error during validation:", err);
    process.exit(1);
  });

