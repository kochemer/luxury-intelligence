import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { DateTime } from 'luxon';
import { parse } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Environment Variable Loading (MUST BE FIRST) ---
const envPath = path.join(__dirname, '../.env.local');
let envResult: { error?: Error; parsed?: Record<string, string> } = { parsed: {} };
try {
  const buffer = readFileSync(envPath);
  let contentToParse: string;
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    contentToParse = buffer.toString('utf16le', 2);
  } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    const leBuffer = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i < buffer.length; i += 2) {
      leBuffer[i - 2] = buffer[i + 1];
      leBuffer[i - 1] = buffer[i];
    }
    contentToParse = leBuffer.toString('utf16le');
  } else if (buffer.length > 0 && buffer[1] === 0 && buffer[0] !== 0) {
    contentToParse = buffer.toString('utf16le');
  } else {
    contentToParse = buffer.toString('utf-8');
  }
  const parsed = parse(contentToParse);
  Object.assign(process.env, parsed);
  envResult.parsed = parsed;
} catch (err) {
  envResult.error = err as Error;
}

// Import discovery modules AFTER env is loaded
import { generateSearchQueries } from '../discovery/queryDirector';
import { searchWithTavily } from '../discovery/searchProvider';
import { fetchAndExtractArticles } from '../discovery/fetchExtract';
import { selectTopArticles } from '../discovery/selectTop';
import { mergeDiscoveryArticles } from '../discovery/mergeArticles';
import type { Article } from '../ingestion/types';

// --- Configuration ---
type DiscoveryConfig = {
  weekLabel: string;
  maxCandidates: number;
  selectTop: number;
  searchProvider: 'tavily' | 'bing' | 'serpapi';
};

function parseArgs(): DiscoveryConfig {
  const args = process.argv.slice(2);
  let weekLabel: string | null = null;
  let maxCandidates = 120;
  let selectTop = 20;
  let searchProvider: 'tavily' | 'bing' | 'serpapi' = 'tavily';

  for (const arg of args) {
    if (arg.startsWith('--week=')) {
      weekLabel = arg.split('=')[1];
      if (!/^\d{4}-W\d{1,2}$/.test(weekLabel)) {
        console.error(`Invalid week format: ${weekLabel}. Expected YYYY-W## (e.g. 2026-W01)`);
        process.exit(1);
      }
    } else if (arg.startsWith('--maxCandidates=')) {
      maxCandidates = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--selectTop=')) {
      selectTop = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--searchProvider=')) {
      const provider = arg.split('=')[1];
      if (provider === 'tavily' || provider === 'bing' || provider === 'serpapi') {
        searchProvider = provider;
      }
    }
  }

  if (!weekLabel) {
    // Default to current week
    const now = DateTime.now().setZone('Europe/Copenhagen');
    const year = now.year;
    const weekNumber = now.weekNumber;
    weekLabel = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  return { weekLabel, maxCandidates, selectTop, searchProvider };
}

async function main() {
  const config = parseArgs();
  
  console.log('Web Discovery Configuration:');
  console.log(`  Week: ${config.weekLabel}`);
  console.log(`  Max candidates per category: ${config.maxCandidates}`);
  console.log(`  Select top per category: ${config.selectTop}`);
  console.log(`  Search provider: ${config.searchProvider}`);
  
  if (config.searchProvider === 'tavily' && !process.env.TAVILY_API_KEY) {
    console.error('Error: TAVILY_API_KEY not found in environment variables');
    process.exit(1);
  }
  console.log('');

  const weekDir = path.join(__dirname, '../data/weeks', config.weekLabel);
  const discoveryDir = path.join(weekDir, 'discovery');
  
  // Step 1: Generate search queries
  console.log('[Step 1] Generating search queries...');
  const queries = await generateSearchQueries(config.weekLabel, discoveryDir);
  console.log(`✓ Generated ${Object.values(queries).flat().length} queries across ${Object.keys(queries).length} categories\n`);

  // Step 2: Search
  console.log('[Step 2] Searching the web...');
  const searchResults = await searchWithTavily(queries, config.maxCandidates, discoveryDir);
  console.log(`✓ Found ${searchResults.length} candidate URLs\n`);

  // Step 3: Fetch and extract
  console.log('[Step 3] Fetching and extracting articles...');
  const extracted = await fetchAndExtractArticles(searchResults, discoveryDir);
  console.log(`✓ Extracted ${extracted.length} articles\n`);

  // Step 4: Select top articles
  console.log('[Step 4] Selecting top articles...');
  const selected = await selectTopArticles(extracted, config.selectTop, config.weekLabel, discoveryDir);
  console.log(`✓ Selected ${selected.length} articles\n`);

  // Step 5: Save discovery articles separately (week-scoped)
  console.log('[Step 5] Saving discovery articles...');
  const merged = await mergeDiscoveryArticles(selected, config.weekLabel);
  console.log(`✓ Saved ${merged.added} new discovery articles, ${merged.updated} updated (stored in data/weeks/${config.weekLabel}/discoveryArticles.json)\n`);

  console.log('Discovery complete!');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

