import Parser from 'rss-parser';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SOURCE_FEEDS } from '../ingestion/sources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type FeedHealthResult = {
  source: string;
  url: string;
  status: string;
  items: number;
  newestDate: string | null;
  oldestDate: string | null;
  error: string | null;
};

const parser = new Parser();

async function validateFeed(feed: { name: string; url: string }): Promise<FeedHealthResult> {
  const result: FeedHealthResult = {
    source: feed.name,
    url: feed.url,
    status: 'unknown',
    items: 0,
    newestDate: null,
    oldestDate: null,
    error: null,
  };

  try {
    // Fetch with browser-like headers
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const response = await fetch(feed.url, { headers });
    result.status = `${response.status} ${response.statusText}`;

    if (!response.ok) {
      result.error = `HTTP ${response.status}: ${response.statusText}`;
      return result;
    }

    const text = await response.text();

    // Parse with rss-parser
    let rss;
    try {
      rss = await parser.parseString(text);
    } catch (parseError) {
      result.error = `Parse error: ${(parseError as Error).message}`;
      return result;
    }

    const items = rss.items || [];
    result.items = items.length;

    if (items.length === 0) {
      result.error = 'No items found in feed';
      return result;
    }

    // Extract dates and find newest/oldest
    const dates: Date[] = [];
    for (const item of items) {
      const dateStr = item.isoDate || item.pubDate;
      if (dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          dates.push(date);
        }
      }
    }

    if (dates.length > 0) {
      dates.sort((a, b) => a.getTime() - b.getTime());
      result.oldestDate = dates[0].toISOString();
      result.newestDate = dates[dates.length - 1].toISOString();
    } else {
      result.error = 'No valid dates found in feed items';
    }
  } catch (err) {
    result.error = (err as Error).message;
    if (!result.status || result.status === 'unknown') {
      result.status = 'error';
    }
  }

  return result;
}

function formatTable(results: FeedHealthResult[]): string {
  // Calculate column widths
  const sourceWidth = Math.max(8, ...results.map(r => r.source.length));
  const urlWidth = Math.max(3, ...results.map(r => r.url.length));
  const statusWidth = Math.max(6, ...results.map(r => r.status.length));
  const itemsWidth = 5;
  const newestWidth = 20;
  const oldestWidth = 20;
  const errorWidth = Math.max(5, ...results.map(r => (r.error || '').length));

  // Header
  const header = [
    'source'.padEnd(sourceWidth),
    'url'.padEnd(urlWidth),
    'status'.padEnd(statusWidth),
    'items'.padEnd(itemsWidth),
    'newestDate'.padEnd(newestWidth),
    'oldestDate'.padEnd(oldestWidth),
    'error'.padEnd(errorWidth),
  ].join(' | ');

  const separator = '-'.repeat(header.length);

  // Rows
  const rows = results.map(r => [
    r.source.padEnd(sourceWidth),
    r.url.padEnd(urlWidth),
    r.status.padEnd(statusWidth),
    r.items.toString().padEnd(itemsWidth),
    (r.newestDate || 'N/A').padEnd(newestWidth),
    (r.oldestDate || 'N/A').padEnd(oldestWidth),
    (r.error || '').padEnd(errorWidth),
  ].join(' | '));

  return [header, separator, ...rows].join('\n');
}

async function main() {
  console.log(`Validating ${SOURCE_FEEDS.length} feeds...\n`);

  const results: FeedHealthResult[] = [];
  
  for (const feed of SOURCE_FEEDS) {
    const result = await validateFeed(feed);
    results.push(result);
    // Show progress
    const statusIcon = result.error ? '❌' : '✅';
    console.log(`${statusIcon} ${feed.name}`);
  }

  console.log('\n' + formatTable(results));

  // Write to JSON
  const outputPath = path.join(__dirname, '../data/feed_health.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    JSON.stringify(results, null, 2),
    'utf-8'
  );

  console.log(`\nResults written to: ${outputPath}`);

  // Summary
  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  console.log(`\nSummary: ${successCount} successful, ${errorCount} failed`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Validation failed:', err);
    process.exit(1);
  });

