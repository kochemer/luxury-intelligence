/**
 * Print source yield table sorted by yield percentage.
 * Shows which sources add value vs duplicates.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SourceYieldReport } from '../ingestion/sourceYield';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const yieldPath = path.join(__dirname, '../data/source_yield.json');
  
  let report: SourceYieldReport;
  try {
    const raw = await fs.readFile(yieldPath, 'utf-8');
    report = JSON.parse(raw);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error('Source yield file not found. Run ingestion first.');
      process.exit(1);
    }
    console.error('Failed to read source yield file:', err.message);
    process.exit(1);
  }

  console.log('\n=== SOURCE YIELD ANALYSIS ===\n');
  console.log(`Report timestamp: ${report.timestamp}\n`);

  // Sort by yield percentage (ascending - worst first)
  const sortedAsc = [...report.sources].sort((a, b) => a.yieldPct - b.yieldPct);
  
  // Sort by yield percentage (descending - best first)
  const sortedDesc = [...report.sources].sort((a, b) => b.yieldPct - a.yieldPct);

  // Print worst performers (ascending)
  console.log('Lowest Yield Sources (Worst First):');
  console.log('─'.repeat(100));
  console.log(
    'Source'.padEnd(45) +
    'Type'.padStart(6) +
    'Fetched'.padStart(10) +
    'Parsed'.padStart(10) +
    'New'.padStart(8) +
    'Dupes'.padStart(8) +
    'Yield%'.padStart(10)
  );
  console.log('─'.repeat(100));
  
  for (const source of sortedAsc) {
    const type = source.type.toUpperCase();
    console.log(
      source.sourceName.padEnd(45) +
      type.padStart(6) +
      source.itemsFetched.toString().padStart(10) +
      source.itemsParsed.toString().padStart(10) +
      source.newArticlesAdded.toString().padStart(8) +
      source.duplicates.toString().padStart(8) +
      source.yieldPct.toFixed(1).padStart(9) + '%'
    );
  }

  console.log('─'.repeat(100));
  console.log('\nHighest Yield Sources (Best First):');
  console.log('─'.repeat(100));
  console.log(
    'Source'.padEnd(45) +
    'Type'.padStart(6) +
    'Fetched'.padStart(10) +
    'Parsed'.padStart(10) +
    'New'.padStart(8) +
    'Dupes'.padStart(8) +
    'Yield%'.padStart(10)
  );
  console.log('─'.repeat(100));
  
  for (const source of sortedDesc) {
    const type = source.type.toUpperCase();
    console.log(
      source.sourceName.padEnd(45) +
      type.padStart(6) +
      source.itemsFetched.toString().padStart(10) +
      source.itemsParsed.toString().padStart(10) +
      source.newArticlesAdded.toString().padStart(8) +
      source.duplicates.toString().padStart(8) +
      source.yieldPct.toFixed(1).padStart(9) + '%'
    );
  }

  console.log('─'.repeat(100));
  console.log('\nSummary:');
  console.log(`  Total sources: ${report.summary.totalSources}`);
  console.log(`  Total items fetched: ${report.summary.totalItemsFetched}`);
  console.log(`  Total new articles: ${report.summary.totalNewArticles}`);
  console.log(`  Total duplicates: ${report.summary.totalDuplicates}`);
  console.log(`  Overall yield: ${report.summary.overallYieldPct.toFixed(1)}%`);
  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});


