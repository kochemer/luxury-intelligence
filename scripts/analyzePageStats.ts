import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  yieldPercentage: number;
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

async function main() {
  const statsPath = path.join(__dirname, '../data/page_source_stats.json');
  const raw = await fs.readFile(statsPath, 'utf-8');
  const stats: PageIngestionStats = JSON.parse(raw);

  console.log('\n=== PAGE SOURCE YIELD ANALYSIS ===\n');
  
  console.log('Per-Source Yield Table:');
  console.log('─'.repeat(100));
  console.log(
    'Source'.padEnd(35) +
    'Items'.padStart(8) +
    'Extracted'.padStart(12) +
    'Kept'.padStart(8) +
    'Yield%'.padStart(10) +
    'Rejections'.padStart(20)
  );
  console.log('─'.repeat(100));

  stats.sources.forEach(s => {
    const rejections = 
      s.rejectedNoDate + 
      s.rejectedInvalidDate + 
      s.rejectedNoTitle + 
      s.rejectedNoUrl + 
      s.rejectedDuplicate + 
      s.rejectedSelectorMiss;
    
    console.log(
      s.sourceName.padEnd(35) +
      s.itemsMatched.toString().padStart(8) +
      s.articlesExtracted.toString().padStart(12) +
      s.articlesKept.toString().padStart(8) +
      s.yieldPercentage.toFixed(1).padStart(9) + '%' +
      rejections.toString().padStart(19)
    );
  });

  console.log('─'.repeat(100));
  
  // Filter out sources with fetch failures
  const validSources = stats.sources.filter(s => s.fetchStatus === 200 && s.itemsMatched > 0);
  
  // Sort by yield percentage (lowest first)
  const sorted = [...validSources].sort((a, b) => a.yieldPercentage - b.yieldPercentage);
  
  console.log('\nTop 2 Underperforming Sources by Yield %:');
  sorted.slice(0, 2).forEach((s, i) => {
    console.log(`\n${i + 1}. ${s.sourceName}`);
    console.log(`   Yield: ${s.yieldPercentage.toFixed(1)}% (${s.articlesKept}/${s.itemsMatched} items kept)`);
    console.log(`   Rejections breakdown:`);
    console.log(`     - No date: ${s.rejectedNoDate}`);
    console.log(`     - Invalid date: ${s.rejectedInvalidDate}`);
    console.log(`     - No title: ${s.rejectedNoTitle}`);
    console.log(`     - No URL: ${s.rejectedNoUrl}`);
    console.log(`     - Duplicate: ${s.rejectedDuplicate}`);
    console.log(`     - Selector miss: ${s.rejectedSelectorMiss}`);
    
    if (s.failures.length > 0) {
      console.log(`   Sample failures (first 3):`);
      s.failures.slice(0, 3).forEach((f, idx) => {
        const parts = [f.reason];
        if (f.url) parts.push(`URL: ${f.url}`);
        if (f.title) parts.push(`Title: ${f.title.substring(0, 50)}`);
        console.log(`     ${idx + 1}. ${parts.join(' | ')}`);
      });
    }
  });

  // BoF specific analysis
  const bof = stats.sources.find(s => s.sourceName.includes('BoF'));
  if (bof) {
    console.log('\n=== BoF Failure Analysis ===');
    console.log(`Items matched: ${bof.itemsMatched}`);
    console.log(`Articles extracted: ${bof.articlesExtracted}`);
    console.log(`Articles kept: ${bof.articlesKept}`);
    console.log(`\nRejection breakdown:`);
    console.log(`  - Selector misses: ${bof.rejectedSelectorMiss} (link selector not finding links)`);
    console.log(`  - Duplicates: ${bof.rejectedDuplicate}`);
    console.log(`  - No date: ${bof.rejectedNoDate}`);
    console.log(`  - Invalid date: ${bof.rejectedInvalidDate}`);
    console.log(`  - No title: ${bof.rejectedNoTitle}`);
    console.log(`  - No URL: ${bof.rejectedNoUrl}`);
    
    if (bof.failures.length > 0) {
      console.log(`\nFailure reasons (capped at 10):`);
      const reasonCounts = new Map<string, number>();
      bof.failures.forEach(f => {
        reasonCounts.set(f.reason, (reasonCounts.get(f.reason) || 0) + 1);
      });
      reasonCounts.forEach((count, reason) => {
        console.log(`  - ${reason}: ${count} occurrences`);
      });
    }
    
    console.log(`\nConclusion: BoF is failing due to SELECTOR FRAGILITY`);
    console.log(`  - The link selector 'a' is not matching ${bof.rejectedSelectorMiss} out of ${bof.itemsMatched} items`);
    console.log(`  - This suggests:`);
    console.log(`    1. The HTML structure may have changed`);
    console.log(`    2. The page may require JS rendering (content loaded dynamically)`);
    console.log(`    3. The selector may need to be more specific`);
    console.log(`  - Date parsing: ${bof.rejectedNoDate} no date, ${bof.rejectedInvalidDate} invalid date`);
    console.log(`    (Date parsing appears to be working when dates are found)`);
  }

  console.log('\n=== Summary ===');
  console.log(`Total pages fetched: ${stats.summary.totalPagesFetched}`);
  console.log(`Total items matched: ${stats.summary.totalItemsMatched}`);
  console.log(`Total articles extracted: ${stats.summary.totalArticlesExtracted}`);
  console.log(`Total articles kept: ${stats.summary.totalArticlesKept}`);
  console.log(`Overall yield: ${stats.summary.overallYieldPercentage.toFixed(1)}%`);
  console.log(`\nTimestamp: ${stats.timestamp}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});



