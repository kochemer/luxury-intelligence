import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RSS_SOURCES = [
  'Jeweller - Business News',
  'Jeweller - Jewellery Trends',
  'Jeweller - Main',
  'JCK Online',
  'Professional Jeweller',
  'Luxury Daily - Retail',
  'Luxury Daily - Commerce',
  'Luxury Daily - Research',
  'Retail Dive',
  'Practical Ecommerce',
  'Modern Retail',
  'TechCrunch Ecommerce',
  'Digital Commerce 360',
  'NYTimes Technology',
  'MIT Sloan Management Review – AI',
  'Benedict Evans',
  'Stratechery'
];

const PAGE_SOURCES = [
  'BoF - News (The News in Brief)',
  'MIT Technology Review - AI'
];

async function analyzeDigest(weekLabel: string) {
  const digestPath = path.join(__dirname, '../data/digests', `${weekLabel}.json`);
  const discoveryPath = path.join(__dirname, '../data/weeks', weekLabel, 'discoveryArticles.json');
  
  const digest = JSON.parse(await fs.readFile(digestPath, 'utf-8'));
  let discoveryArticles: any[] = [];
  try {
    discoveryArticles = JSON.parse(await fs.readFile(discoveryPath, 'utf-8'));
  } catch {
    console.log(`No discovery articles found for ${weekLabel}`);
  }
  
  const discoveryUrls = new Set(discoveryArticles.map((a: any) => a.url));
  
  const byPipeline = {
    RSS: [] as any[],
    Fetch: [] as any[],
    Discovery: [] as any[]
  };
  
  const allArticles = [
    ...digest.topics.AI_and_Strategy.top,
    ...digest.topics.Ecommerce_Retail_Tech.top,
    ...digest.topics.Luxury_and_Consumer.top,
    ...digest.topics.Jewellery_Industry.top
  ];
  
  for (const article of allArticles) {
    if (discoveryUrls.has(article.url)) {
      byPipeline.Discovery.push(article);
    } else if (PAGE_SOURCES.includes(article.source)) {
      byPipeline.Fetch.push(article);
    } else if (RSS_SOURCES.includes(article.source)) {
      byPipeline.RSS.push(article);
    } else {
      // Unknown source, assume RSS (most common)
      byPipeline.RSS.push(article);
    }
  }
  
  console.log('=== ARTICLES BY INGESTION PIPELINE ===\n');
  
  console.log(`RSS: ${byPipeline.RSS.length} articles`);
  byPipeline.RSS.forEach(a => {
    console.log(`  - ${a.title}`);
    console.log(`    Source: ${a.source}`);
  });
  
  console.log(`\nFetch (Page): ${byPipeline.Fetch.length} articles`);
  byPipeline.Fetch.forEach(a => {
    console.log(`  - ${a.title}`);
    console.log(`    Source: ${a.source}`);
  });
  
  console.log(`\nDiscovery: ${byPipeline.Discovery.length} articles`);
  byPipeline.Discovery.forEach(a => {
    console.log(`  - ${a.title}`);
    console.log(`    Source: ${a.source}`);
  });
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total in digest: ${allArticles.length}`);
  console.log(`RSS: ${byPipeline.RSS.length} (${(byPipeline.RSS.length / allArticles.length * 100).toFixed(1)}%)`);
  console.log(`Fetch: ${byPipeline.Fetch.length} (${(byPipeline.Fetch.length / allArticles.length * 100).toFixed(1)}%)`);
  console.log(`Discovery: ${byPipeline.Discovery.length} (${(byPipeline.Discovery.length / allArticles.length * 100).toFixed(1)}%)`);
  
  // By topic breakdown
  console.log(`\n=== BY TOPIC ===`);
  const topics = ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'] as const;
  for (const topic of topics) {
    const topicArticles = digest.topics[topic].top;
    const topicRSS = topicArticles.filter((a: any) => !discoveryUrls.has(a.url) && !PAGE_SOURCES.includes(a.source));
    const topicFetch = topicArticles.filter((a: any) => !discoveryUrls.has(a.url) && PAGE_SOURCES.includes(a.source));
    const topicDiscovery = topicArticles.filter((a: any) => discoveryUrls.has(a.url));
    console.log(`\n${topic}:`);
    console.log(`  RSS: ${topicRSS.length}, Fetch: ${topicFetch.length}, Discovery: ${topicDiscovery.length}`);
  }
}

const weekLabel = process.argv[2] || '2026-W02';
analyzeDigest(weekLabel).catch(console.error);
