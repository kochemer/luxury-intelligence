import { runRssIngestion } from "./fetchRss.js";
import { runPageIngestion } from "./fetchPages.js";
import { resetYieldStats, saveYieldReport } from "./sourceYield.js";

async function main() {
  try {
    // Reset yield stats at start of ingestion
    resetYieldStats();
    
    const rssResult = await runRssIngestion();
    console.log(`[Combined] RSS ingestion added ${rssResult.added} new articles, updated ${rssResult.updated} existing articles with snippets.`);

    // Integrate page ingestion here, after RSS ingestion
    const pageAdded = await runPageIngestion();
    console.log(`[Combined] Page ingestion added ${pageAdded} new articles.`);

    const overallTotal = (rssResult.added || 0) + (pageAdded || 0);
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
