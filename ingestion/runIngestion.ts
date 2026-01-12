import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { parse } from 'dotenv';
import { runRssIngestion } from "./fetchRss.js";
import { runPageIngestion } from "./fetchPages.js";
import { resetYieldStats, saveYieldReport } from "./sourceYield.js";
import { DateTime } from "luxon";

// --- Environment Variable Loading (MUST BE FIRST) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

type IngestionMode = 'rss' | 'webDiscovery' | 'both';

function parseArgs(): { mode: IngestionMode; weekLabel?: string } {
  const args = process.argv.slice(2);
  let mode: IngestionMode = 'both';
  let weekLabel: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--mode=')) {
      const modeValue = arg.split('=')[1];
      if (modeValue === 'rss' || modeValue === 'webDiscovery' || modeValue === 'both') {
        mode = modeValue as IngestionMode;
      }
    } else if (arg.startsWith('--week=')) {
      weekLabel = arg.split('=')[1];
      if (!/^\d{4}-W\d{1,2}$/.test(weekLabel)) {
        console.error(`Invalid week format: ${weekLabel}. Expected YYYY-W## (e.g. 2026-W01)`);
        process.exit(1);
      }
    }
  }

  return { mode, weekLabel };
}

async function runWebDiscovery(weekLabel?: string): Promise<{ added: number; updated: number }> {
  if (!weekLabel) {
    // Default to current week
    const now = DateTime.now().setZone('Europe/Copenhagen');
    const year = now.year;
    const weekNumber = now.weekNumber;
    weekLabel = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  // Import and run discovery
  const { generateSearchQueries } = await import('../discovery/queryDirector.js');
  const { searchWithTavily } = await import('../discovery/searchProvider.js');
  const { fetchAndExtractArticles } = await import('../discovery/fetchExtract.js');
  const { selectTopArticles } = await import('../discovery/selectTop.js');
  const { mergeDiscoveryArticles } = await import('../discovery/mergeArticles.js');
  const pathModule = await import('path');
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = pathModule.dirname(__filename);

  const weekDir = pathModule.join(__dirname, '../data/weeks', weekLabel);
  const discoveryDir = pathModule.join(weekDir, 'discovery');

  console.log('[Discovery] Starting web discovery...');
  const queries = await generateSearchQueries(weekLabel, discoveryDir);
  const searchResults = await searchWithTavily(queries, 120, discoveryDir);
  const extracted = await fetchAndExtractArticles(searchResults, discoveryDir);
  const selected = await selectTopArticles(extracted, 20, weekLabel, discoveryDir);
  const merged = await mergeDiscoveryArticles(selected, weekLabel);
  
  console.log(`[Discovery] Saved ${merged.added} new discovery articles, ${merged.updated} updated (stored in data/weeks/${weekLabel}/discoveryArticles.json)`);
  return merged;
}

async function main() {
  try {
    const { mode, weekLabel } = parseArgs();
    
    console.log(`[Ingestion] Mode: ${mode}`);
    if (weekLabel) {
      console.log(`[Ingestion] Week: ${weekLabel}`);
    }
    console.log('');

    // Reset yield stats at start of ingestion
    resetYieldStats();
    
    let rssResult = { added: 0, updated: 0 };
    let pageAdded = 0;
    let discoveryResult = { added: 0, updated: 0 };

    if (mode === 'rss' || mode === 'both') {
      rssResult = await runRssIngestion();
      console.log(`[Combined] RSS ingestion added ${rssResult.added} new articles, updated ${rssResult.updated} existing articles with snippets.`);

      // Integrate page ingestion here, after RSS ingestion
      pageAdded = await runPageIngestion();
      console.log(`[Combined] Page ingestion added ${pageAdded} new articles.`);
    }

    if (mode === 'webDiscovery' || mode === 'both') {
      discoveryResult = await runWebDiscovery(weekLabel);
    }

    const overallTotal = rssResult.added + pageAdded + discoveryResult.added;
    console.log(`[Combined] Ingestion complete. Total new articles added: ${overallTotal}.`);

    // Save yield report
    await saveYieldReport();
    console.log(`[Combined] Source yield report saved to data/source_yield.json`);

    process.exit(0);
  } catch (err) {
    console.error("Fatal error during ingestion:", err);
    process.exit(1);
  }
}

// Only run if this file is executed directly from the command line
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.includes('runIngestion.ts')) {
  main();
}
