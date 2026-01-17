import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { getWeekRangeCET } from '../utils/weekCET';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeDiscoveryFiltering(weekLabel: string) {
  const discoveryPath = path.join(__dirname, '../data/weeks', weekLabel, 'discoveryArticles.json');
  const digestPath = path.join(__dirname, '../data/digests', `${weekLabel}.json`);
  const ingestionReportPath = path.join(__dirname, '../data/weeks', weekLabel, 'ingestion-report.json');
  
  const discoveryArticles = JSON.parse(await fs.readFile(discoveryPath, 'utf-8'));
  const digest = JSON.parse(await fs.readFile(digestPath, 'utf-8'));
  const ingestionReport = JSON.parse(await fs.readFile(ingestionReportPath, 'utf-8'));
  
  // Get week window
  const weekMatch = weekLabel.match(/^(\d{4})-W(\d{1,2})$/);
  if (!weekMatch) throw new Error(`Invalid week format: ${weekLabel}`);
  const year = parseInt(weekMatch[1], 10);
  const weekNumber = parseInt(weekMatch[2], 10);
  const dt = DateTime.fromObject({ weekYear: year, weekNumber }, { zone: 'Europe/Copenhagen' });
  const { weekStartCET, weekEndCET } = getWeekRangeCET(dt.toJSDate());
  const weekStart = weekStartCET.getTime();
  const weekEnd = weekEndCET.getTime();
  
  // Get all articles from digest
  const digestArticles = [
    ...digest.topics.AI_and_Strategy.top,
    ...digest.topics.Ecommerce_Retail_Tech.top,
    ...digest.topics.Luxury_and_Consumer.top,
    ...digest.topics.Jewellery_Industry.top
  ];
  const digestUrls = new Set(digestArticles.map(a => a.url));
  
  console.log('=== DISCOVERY PIPELINE ANALYSIS ===\n');
  console.log(`Week: ${weekLabel}`);
  console.log(`Week window: ${weekStartCET.toISOString()} to ${weekEndCET.toISOString()}\n`);
  
  console.log(`Total discovery articles found: ${discoveryArticles.length}\n`);
  
  // Analyze each discovery article
  const analysis = {
    total: discoveryArticles.length,
    inWeekWindow: [] as any[],
    outsideWeekWindow: [] as any[],
    invalidDate: [] as any[],
    inDigest: [] as any[],
    notInDigest: [] as any[]
  };
  
  for (const article of discoveryArticles) {
    const articleInfo = {
      title: article.title,
      url: article.url,
      source: article.source,
      published_at: article.published_at,
      ingested_at: article.ingested_at
    };
    
    // Check week window
    if (!article.published_at) {
      analysis.invalidDate.push({ ...articleInfo, reason: 'Missing published_at' });
      continue;
    }
    
    let articleTime: number;
    try {
      const dt = new Date(article.published_at);
      articleTime = dt.getTime();
      if (isNaN(articleTime)) {
        analysis.invalidDate.push({ ...articleInfo, reason: 'Invalid date format', parsed: article.published_at });
        continue;
      }
    } catch (e) {
      analysis.invalidDate.push({ ...articleInfo, reason: 'Date parse error', error: String(e) });
      continue;
    }
    
    if (articleTime >= weekStart && articleTime <= weekEnd) {
      analysis.inWeekWindow.push(articleInfo);
      if (digestUrls.has(article.url)) {
        analysis.inDigest.push(articleInfo);
      } else {
        analysis.notInDigest.push(articleInfo);
      }
    } else {
      analysis.outsideWeekWindow.push({
        ...articleInfo,
        articleTime: new Date(articleTime).toISOString(),
        weekStart: new Date(weekStart).toISOString(),
        weekEnd: new Date(weekEnd).toISOString()
      });
    }
  }
  
  console.log('=== BREAKDOWN ===\n');
  console.log(`1. Invalid/Missing Dates: ${analysis.invalidDate.length}`);
  analysis.invalidDate.forEach(a => {
    console.log(`   - ${a.title}`);
    console.log(`     Published: ${a.published_at} (${a.reason})`);
  });
  
  console.log(`\n2. Outside Week Window: ${analysis.outsideWeekWindow.length}`);
  analysis.outsideWeekWindow.forEach(a => {
    console.log(`   - ${a.title}`);
    console.log(`     Published: ${a.articleTime}`);
    console.log(`     Week: ${a.weekStart} to ${a.weekEnd}`);
  });
  
  console.log(`\n3. Within Week Window: ${analysis.inWeekWindow.length}`);
  
  console.log(`\n4. Made it to Digest: ${analysis.inDigest.length}`);
  analysis.inDigest.forEach(a => {
    console.log(`   - ${a.title} (${a.source})`);
  });
  
  console.log(`\n5. In Week Window but NOT in Digest: ${analysis.notInDigest.length}`);
  analysis.notInDigest.forEach(a => {
    console.log(`   - ${a.title} (${a.source})`);
    console.log(`     Published: ${a.published_at}`);
  });
  
  // Check ingestion report stats
  console.log(`\n=== INGESTION REPORT STATS ===\n`);
  for (const [category, stats] of Object.entries(ingestionReport.categories)) {
    const statsTyped = stats as any;
    console.log(`${category}:`);
    console.log(`  Discovery found: ${statsTyped.discovery_found}`);
    console.log(`  Fetched OK: ${statsTyped.fetched_ok}`);
    console.log(`  Extracted OK: ${statsTyped.extracted_ok}`);
    console.log(`  Excluded:`);
    console.log(`    - Too short: ${statsTyped.excluded.tooShort}`);
    console.log(`    - Not article: ${statsTyped.excluded.notArticle}`);
    console.log(`    - Paywalled: ${statsTyped.excluded.paywalled}`);
    console.log(`    - Non-English: ${statsTyped.excluded.nonEnglish}`);
    console.log(`    - Controversial: ${statsTyped.excluded.controversial}`);
    console.log(`    - Duplicate: ${statsTyped.excluded.duplicate}`);
    console.log(`  Final candidates: ${statsTyped.final_candidates}`);
    console.log('');
  }
  
  // Summary
  console.log('=== SUMMARY ===\n');
  // Analyze with new soft window logic
  const softWindowAnalysis = {
    total: discoveryArticles.length,
    includedViaPublishedAt: [] as any[],
    includedViaDiscoveredAt: [] as any[],
    excluded: [] as any[]
  };
  
  const oneDayMs = 24 * 60 * 60 * 1000;
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  const softWeekStart = weekStart - oneDayMs;
  const softWeekEnd = weekEnd + oneDayMs;
  const maxAgeCutoff = weekStart - maxAgeMs;
  
  for (const article of discoveryArticles) {
    let included = false;
    let viaPublishedAt = false;
    let viaDiscoveredAt = false;
    let reason = '';
    
    // Try publishedAt first (if valid)
    if (article.published_at && !article.publishedDateInvalid) {
      const publishedTime = new Date(article.published_at).getTime();
      if (!isNaN(publishedTime)) {
        if (publishedTime < maxAgeCutoff) {
          reason = 'Too old (publishedAt < weekStart - 30 days)';
        } else if (publishedTime >= softWeekStart && publishedTime <= softWeekEnd) {
          included = true;
          viaPublishedAt = true;
        }
      }
    }
    
    // Fallback to discoveredAt
    if (!included && article.discoveredAt) {
      const discoveredTime = new Date(article.discoveredAt).getTime();
      if (!isNaN(discoveredTime)) {
        if (discoveredTime < maxAgeCutoff) {
          reason = 'Too old (discoveredAt < weekStart - 30 days)';
        } else if (discoveredTime >= weekStart && discoveredTime <= weekEnd) {
          included = true;
          viaDiscoveredAt = true;
        }
      }
    }
    
    if (!included && !reason) {
      reason = 'Outside soft week window';
    }
    
    if (included) {
      if (viaPublishedAt) {
        softWindowAnalysis.includedViaPublishedAt.push(article);
      } else if (viaDiscoveredAt) {
        softWindowAnalysis.includedViaDiscoveredAt.push(article);
      }
    } else {
      softWindowAnalysis.excluded.push({ article, reason });
    }
  }
  
  console.log(`\n=== SUMMARY (OLD STRICT LOGIC) ===\n`);
  console.log(`Total discovery articles: ${analysis.total}`);
  console.log(`  - Invalid dates: ${analysis.invalidDate.length} (${(analysis.invalidDate.length/analysis.total*100).toFixed(1)}%)`);
  console.log(`  - Outside week window: ${analysis.outsideWeekWindow.length} (${(analysis.outsideWeekWindow.length/analysis.total*100).toFixed(1)}%)`);
  console.log(`  - In week window: ${analysis.inWeekWindow.length} (${(analysis.inWeekWindow.length/analysis.total*100).toFixed(1)}%)`);
  console.log(`    - Made it to digest: ${analysis.inDigest.length} (${(analysis.inDigest.length/analysis.inWeekWindow.length*100).toFixed(1)}% of in-window)`);
  console.log(`    - Filtered out: ${analysis.notInDigest.length} (${(analysis.notInDigest.length/analysis.inWeekWindow.length*100).toFixed(1)}% of in-window)`);
  
  console.log(`\n=== SUMMARY (NEW SOFT LOGIC) ===\n`);
  console.log(`Total discovery articles: ${softWindowAnalysis.total}`);
  console.log(`  - Included via publishedAt: ${softWindowAnalysis.includedViaPublishedAt.length} (${(softWindowAnalysis.includedViaPublishedAt.length/softWindowAnalysis.total*100).toFixed(1)}%)`);
  console.log(`  - Included via discoveredAt fallback: ${softWindowAnalysis.includedViaDiscoveredAt.length} (${(softWindowAnalysis.includedViaDiscoveredAt.length/softWindowAnalysis.total*100).toFixed(1)}%)`);
  console.log(`  - Excluded: ${softWindowAnalysis.excluded.length} (${(softWindowAnalysis.excluded.length/softWindowAnalysis.total*100).toFixed(1)}%)`);
  console.log(`\n  Total included: ${softWindowAnalysis.includedViaPublishedAt.length + softWindowAnalysis.includedViaDiscoveredAt.length} (${((softWindowAnalysis.includedViaPublishedAt.length + softWindowAnalysis.includedViaDiscoveredAt.length)/softWindowAnalysis.total*100).toFixed(1)}%)`);
  
  console.log(`\n=== BEFORE vs AFTER ===\n`);
  console.log(`Before (strict): ${analysis.inDigest.length} articles in digest`);
  console.log(`After (soft): ${softWindowAnalysis.includedViaPublishedAt.length + softWindowAnalysis.includedViaDiscoveredAt.length} articles would be included`);
  console.log(`Improvement: +${(softWindowAnalysis.includedViaPublishedAt.length + softWindowAnalysis.includedViaDiscoveredAt.length) - analysis.inDigest.length} articles`);
  
  if (softWindowAnalysis.includedViaDiscoveredAt.length > 0) {
    console.log(`\n=== ARTICLES INCLUDED VIA DISCOVEREDAT FALLBACK ===\n`);
    softWindowAnalysis.includedViaDiscoveredAt.forEach(a => {
      console.log(`  - ${a.title}`);
      console.log(`    Published: ${a.published_at || 'N/A'} (${a.publishedDateInvalid ? 'INVALID' : 'valid'})`);
      console.log(`    Discovered: ${a.discoveredAt}`);
    });
  }
}

const weekLabel = process.argv[2] || '2026-W02';
analyzeDiscoveryFiltering(weekLabel).catch(console.error);
