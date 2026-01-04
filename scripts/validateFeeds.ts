/**
 * RSS/Atom Feed Preflight Validator
 * Validates all feeds in SOURCE_FEEDS before ingestion
 */

import { SOURCE_FEEDS } from '../ingestion/sources.js';
import Parser from 'rss-parser';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FETCH_TIMEOUT_MS = 10000; // 10 seconds
const OUTPUT_PATH = path.join(__dirname, '../data/feed_validation.json');

type ValidationResult = {
  name: string;
  url: string;
  status: number | null;
  contentType: string | null;
  itemsFound: number;
  error: string | null;
  isValid: boolean;
  timestamp: string;
};

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9"
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
}

/**
 * Check if content looks like XML/RSS/Atom
 */
function isXmlLike(text: string): boolean {
  const trimmed = text.trim();
  // Check for XML declaration or RSS/Atom tags
  return (
    trimmed.startsWith('<?xml') ||
    trimmed.startsWith('<rss') ||
    trimmed.startsWith('<feed') ||
    trimmed.startsWith('<RDF') ||
    trimmed.includes('<rss') ||
    trimmed.includes('<feed') ||
    trimmed.includes('<channel')
  );
}

/**
 * Count items in RSS/Atom feed
 */
async function countItems(text: string): Promise<number> {
  try {
    const parser = new Parser();
    const feed = await parser.parseString(text);
    return feed.items?.length || 0;
  } catch (err) {
    // If parsing fails, try to count <item> tags manually
    const itemMatches = text.match(/<item[^>]*>/gi) || text.match(/<entry[^>]*>/gi);
    return itemMatches ? itemMatches.length : 0;
  }
}

/**
 * Validate a single feed
 */
async function validateFeed(feed: { name: string; url: string }): Promise<ValidationResult> {
  const result: ValidationResult = {
    name: feed.name,
    url: feed.url,
    status: null,
    contentType: null,
    itemsFound: 0,
    error: null,
    isValid: false,
    timestamp: new Date().toISOString()
  };

  try {
    // Fetch with timeout
    const response = await fetchWithTimeout(feed.url, FETCH_TIMEOUT_MS);
    result.status = response.status;
    result.contentType = response.headers.get('content-type') || null;

    if (response.status !== 200) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    // Get response text
    const text = await response.text();

    // Check if it's XML-like
    if (!isXmlLike(text)) {
      result.error = 'Response does not appear to be XML/RSS/Atom';
      return result;
    }

    // Count items
    result.itemsFound = await countItems(text);
    result.isValid = true;

  } catch (err: any) {
    result.error = err.message || String(err);
  }

  return result;
}

/**
 * Format table row
 */
function formatRow(result: ValidationResult): string {
  const name = result.name.padEnd(45);
  const status = (result.status?.toString() || 'N/A').padStart(6);
  const contentType = (result.contentType?.substring(0, 30) || 'N/A').padEnd(30);
  const items = result.itemsFound.toString().padStart(6);
  const error = result.error ? result.error.substring(0, 40) : 'OK';
  const valid = result.isValid ? '✓' : '✗';
  
  return `${valid} ${name} ${status} ${contentType} ${items} ${error}`;
}

async function main() {
  console.log('=== RSS/Atom Feed Validation ===\n');
  console.log(`Validating ${SOURCE_FEEDS.length} feeds...\n`);

  const results: ValidationResult[] = [];

  // Validate each feed
  for (const feed of SOURCE_FEEDS) {
    process.stdout.write(`Validating ${feed.name}... `);
    const result = await validateFeed(feed);
    results.push(result);
    
    if (result.isValid) {
      console.log(`✓ ${result.itemsFound} items`);
    } else {
      console.log(`✗ ${result.error || 'Failed'}`);
    }
  }

  // Print table
  console.log('\n=== Validation Results ===\n');
  console.log('Status | Source Name'.padEnd(45) + 'HTTP'.padStart(6) + 'Content-Type'.padStart(30) + 'Items'.padStart(6) + 'Error/Status');
  console.log('-'.repeat(150));

  for (const result of results) {
    console.log(formatRow(result));
  }

  // Summary
  const valid = results.filter(r => r.isValid).length;
  const invalid = results.length - valid;
  const totalItems = results.reduce((sum, r) => sum + r.itemsFound, 0);

  console.log('-'.repeat(150));
  console.log(`\nSummary:`);
  console.log(`  Valid feeds: ${valid}/${results.length}`);
  console.log(`  Invalid feeds: ${invalid}/${results.length}`);
  console.log(`  Total items found: ${totalItems}`);

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    totalFeeds: results.length,
    validFeeds: valid,
    invalidFeeds: invalid,
    totalItems,
    results
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✓ Results saved to: ${OUTPUT_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
