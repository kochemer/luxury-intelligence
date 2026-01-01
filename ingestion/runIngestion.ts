import { runRssIngestion } from "./fetchRss.js";
import { runPageIngestion } from "./fetchPages.js";

async function main() {
  try {
    const rssResult = await runRssIngestion();
    console.log(`[Combined] RSS ingestion added ${rssResult.added} new articles, updated ${rssResult.updated} existing articles with snippets.`);

    const pageTotal = await runPageIngestion();
    console.log(`[Combined] Page ingestion added ${pageTotal} new articles.`);

    const overallTotal = (rssResult.added || 0) + (pageTotal || 0);
    console.log(`[Combined] Ingestion complete. Total new articles added: ${overallTotal}.`);

    process.exit(0);
  } catch (err) {
    console.error("Fatal error during ingestion:", err);
    process.exit(1);
  }
}

// Only run if invoked from CLI
if (process.argv[1] === (new URL(import.meta.url)).pathname || process.argv[1] === process.argv[1]) {
  main();
}
