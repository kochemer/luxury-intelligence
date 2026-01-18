import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { parse } from 'dotenv';
import { runRssIngestion } from "./fetchRss.js";
import { runPageIngestion, type PageIngestionStats } from "./fetchPages.js";
import { resetYieldStats, saveYieldReport } from "./sourceYield.js";
import { DateTime } from "luxon";
import {
  createEmptyReport,
  RSS_SOURCE_CATEGORY,
  PAGE_SOURCE_CATEGORY,
  TOPIC_TO_CATEGORY_LABEL,
  writeIngestionReport,
  type IngestionReport
} from "./ingestionReport.js";

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

type DiscoveryIngestionStats = {
  byTopic: Record<keyof typeof TOPIC_TO_CATEGORY_LABEL, {
    discovery_found: number;
    fetched_ok: number;
    extracted_ok: number;
    excluded: {
      nonEnglish: number;
      tooShort: number;
      notArticle: number;
      paywalled: number;
      controversial: number;
      duplicate: number;
    };
    final_candidates: number;
  }>;
};

function getDefaultWeekLabel(): string {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const year = now.year;
  const weekNumber = now.weekNumber;
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

function initDiscoveryStats(): DiscoveryIngestionStats {
  return {
    byTopic: {
      "AI_and_Strategy": {
        discovery_found: 0,
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0, controversial: 0, duplicate: 0 },
        final_candidates: 0
      },
      "Ecommerce_Retail_Tech": {
        discovery_found: 0,
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0, controversial: 0, duplicate: 0 },
        final_candidates: 0
      },
      "Luxury_and_Consumer": {
        discovery_found: 0,
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0, controversial: 0, duplicate: 0 },
        final_candidates: 0
      },
      "Jewellery_Industry": {
        discovery_found: 0,
        fetched_ok: 0,
        extracted_ok: 0,
        excluded: { nonEnglish: 0, tooShort: 0, notArticle: 0, paywalled: 0, controversial: 0, duplicate: 0 },
        final_candidates: 0
      }
    }
  };
}

async function runWebDiscovery(weekLabel?: string): Promise<{ added: number; updated: number; stats: DiscoveryIngestionStats }> {
  if (!weekLabel) {
    weekLabel = getDefaultWeekLabel();
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
  const stats = initDiscoveryStats();
  const queries = await generateSearchQueries(weekLabel, discoveryDir, { regenDelta: false, noDelta: false });
  const { results: searchResults, stats: searchStats } = await searchWithTavily(queries, 120, discoveryDir);
  const { articles: extracted, stats: extractionStats } = await fetchAndExtractArticles(searchResults, discoveryDir);
  const { selected, reportsByTopic } = await selectTopArticles(extracted, 20, weekLabel, discoveryDir);
  const merged = await mergeDiscoveryArticles(selected, weekLabel);
  
  console.log(`[Discovery] Saved ${merged.added} new discovery articles, ${merged.updated} updated (stored in data/weeks/${weekLabel}/discoveryArticles.json)`);

  for (const [topicKey, topicStats] of Object.entries(stats.byTopic)) {
    const topic = topicKey as keyof typeof TOPIC_TO_CATEGORY_LABEL;
    topicStats.discovery_found = searchStats[topic].discovery_found;
    topicStats.fetched_ok = extractionStats.byTopic[topic].fetched_ok;
    topicStats.extracted_ok = extractionStats.byTopic[topic].extracted_ok;
    topicStats.excluded.nonEnglish = extractionStats.byTopic[topic].excluded.nonEnglish;
    topicStats.excluded.tooShort = extractionStats.byTopic[topic].excluded.tooShort;
    topicStats.excluded.notArticle = extractionStats.byTopic[topic].excluded.notArticle;
    topicStats.excluded.paywalled = extractionStats.byTopic[topic].excluded.paywalled;
    topicStats.excluded.duplicate = reportsByTopic[topic].exclusion_counts.duplicate;
    topicStats.excluded.controversial = reportsByTopic[topic].exclusion_counts.hardControversy;
    topicStats.final_candidates = reportsByTopic[topic].selected_count;
  }

  return { ...merged, stats };
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
    
    let rssResult: { added: number; updated: number; feeds: Array<{ sourceName: string; itemsProcessed: number; newArticles: number; categoryHint?: string }> } = { added: 0, updated: 0, feeds: [] };
    let pageResult: { added: number; stats: PageIngestionStats | null } = { added: 0, stats: null };
    let discoveryResult = { added: 0, updated: 0, stats: initDiscoveryStats() };
    const resolvedWeekLabel = weekLabel || getDefaultWeekLabel();

    if (mode === 'rss' || mode === 'both') {
      rssResult = await runRssIngestion();
      console.log(`[Combined] RSS ingestion added ${rssResult.added} new articles, updated ${rssResult.updated} existing articles with snippets.`);

      // Integrate page ingestion here, after RSS ingestion
      pageResult = await runPageIngestion();
      console.log(`[Combined] Page ingestion added ${pageResult.added} new articles.`);
    }

    if (mode === 'webDiscovery' || mode === 'both') {
      discoveryResult = await runWebDiscovery(weekLabel);
    }

    const overallTotal = rssResult.added + pageResult.added + discoveryResult.added;
    console.log(`[Combined] Ingestion complete. Total new articles added: ${overallTotal}.`);

    // Save yield report
    await saveYieldReport();
    console.log(`[Combined] Source yield report saved to data/source_yield.json`);

    const report: IngestionReport = createEmptyReport(resolvedWeekLabel);
    report.generatedAt = new Date().toISOString();

    for (const feed of rssResult.feeds) {
      const category = RSS_SOURCE_CATEGORY[feed.sourceName];
      if (category) {
        report.categories[category].rss_found += feed.newArticles;
      }
    }

    if (pageResult.stats?.sources) {
      for (const source of pageResult.stats.sources) {
        const category = PAGE_SOURCE_CATEGORY[source.sourceName];
        if (category) {
          report.categories[category].rss_found += source.articlesKept;
        }
      }
    }

    for (const [topicKey, topicStats] of Object.entries(discoveryResult.stats.byTopic)) {
      const category = TOPIC_TO_CATEGORY_LABEL[topicKey as keyof typeof TOPIC_TO_CATEGORY_LABEL];
      const target = report.categories[category];
      target.discovery_found += topicStats.discovery_found;
      target.fetched_ok += topicStats.fetched_ok;
      target.extracted_ok += topicStats.extracted_ok;
      target.excluded.nonEnglish += topicStats.excluded.nonEnglish;
      target.excluded.tooShort += topicStats.excluded.tooShort;
      target.excluded.notArticle += topicStats.excluded.notArticle;
      target.excluded.paywalled += topicStats.excluded.paywalled;
      target.excluded.controversial += topicStats.excluded.controversial;
      target.excluded.duplicate += topicStats.excluded.duplicate;
      target.final_candidates += topicStats.final_candidates;
    }

    await writeIngestionReport(report);
    console.log(`[Combined] Ingestion report saved to data/weeks/${resolvedWeekLabel}/ingestion-report.json`);

    // Report categoryHint breakdown
    const categoryHintStats: Record<string, number> = {};
    for (const feed of rssResult.feeds) {
      if (feed.categoryHint) {
        categoryHintStats[feed.categoryHint] = (categoryHintStats[feed.categoryHint] || 0) + feed.newArticles;
      }
    }
    if (Object.keys(categoryHintStats).length > 0) {
      console.log('\n=== CATEGORY HINT BREAKDOWN ===');
      for (const [hint, count] of Object.entries(categoryHintStats)) {
        console.log(`  ${hint}: ${count} articles`);
      }
    }

    // Report top 10 sources by extracted articles
    const topSources = [...rssResult.feeds]
      .sort((a, b) => b.newArticles - a.newArticles)
      .slice(0, 10)
      .filter(f => f.newArticles > 0);
    if (topSources.length > 0) {
      console.log('\n=== TOP 10 RSS SOURCES BY ARTICLES ===');
      for (const feed of topSources) {
        const hintText = feed.categoryHint ? ` [${feed.categoryHint}]` : '';
        console.log(`  ${feed.sourceName}: ${feed.newArticles} articles${hintText}`);
      }
    }

    console.log('\n=== INGESTION SUMMARY ===');
    for (const [category, stats] of Object.entries(report.categories)) {
      const exclusions = stats.excluded;
      const exclusionTotal = Object.values(exclusions).reduce((sum, count) => sum + count, 0);
      const topReasons = Object.entries(exclusions)
        .sort((a, b) => b[1] - a[1])
        .filter(([, count]) => count > 0)
        .slice(0, 2)
        .map(([reason, count]) => `${reason}=${count}`);
      const topReasonsText = topReasons.length > 0 ? topReasons.join(', ') : 'none';
      console.log(`- ${category}: extracted_ok=${stats.extracted_ok}, excluded=${exclusionTotal}, top_exclusions=${topReasonsText}`);
    }

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
