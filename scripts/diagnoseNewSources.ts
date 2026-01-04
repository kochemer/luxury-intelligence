import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const articlesPath = path.join(__dirname, '../data/articles.json');
  const articles: any[] = JSON.parse(await fs.readFile(articlesPath, 'utf-8'));
  
  // Week 2026-W01 range: 2025-12-28T23:00:00.000Z to 2026-01-04T22:59:59.999Z
  const weekStart = new Date('2025-12-28T23:00:00.000Z').getTime();
  const weekEnd = new Date('2026-01-04T22:59:59.999Z').getTime();
  
  // New sources that were added (checking for exact matches and variations)
  const newSources = [
    'MIT Sloan Management Review – AI',
    'MIT Sloan Management Review',
    'Benedict Evans',
    'Stratechery',
    'Digital Commerce 360',
    'Vogue Business',
    'Jing Daily',
    'Luxury Society',
    'Jewellery Outlook'
  ];
  
  // Also get all unique sources to see what's actually in the database
  const allSources = new Set(articles.map((a: any) => a.source));
  console.log('\n=== All Sources in Database ===');
  console.log(`Total unique sources: ${allSources.size}`);
  console.log('Sample sources:', Array.from(allSources).slice(0, 10).join(', '));
  console.log('');
  
  console.log('=== DIAGNOSIS: New Sources ===\n');
  console.log(`Week range: ${new Date(weekStart).toISOString()} to ${new Date(weekEnd).toISOString()}\n`);
  
  const sourceStats: Record<string, {
    total: number;
    inWeek: number;
    outOfWeek: number;
    sampleDates: string[];
  }> = {};
  
  // Count articles by source (checking for partial matches too)
  for (const article of articles) {
    if (!article.source) continue;
    const matches = newSources.some(ns => 
      article.source === ns || 
      article.source.includes(ns) || 
      ns.includes(article.source)
    );
    if (matches) {
      const sourceKey = article.source;
      if (!sourceStats[sourceKey]) {
        sourceStats[sourceKey] = {
          total: 0,
          inWeek: 0,
          outOfWeek: 0,
          sampleDates: []
        };
      }
      
      sourceStats[sourceKey].total++;
      
      if (article.published_at) {
        const pubTime = new Date(article.published_at).getTime();
        if (pubTime >= weekStart && pubTime <= weekEnd) {
          sourceStats[sourceKey].inWeek++;
        } else {
          sourceStats[sourceKey].outOfWeek++;
        }
        
        if (sourceStats[sourceKey].sampleDates.length < 3) {
          sourceStats[sourceKey].sampleDates.push(article.published_at);
        }
      }
    }
  }
  
  // Print results for new sources
  console.log('=== New Sources Analysis ===\n');
  for (const source of newSources) {
    const stats = sourceStats[source] || { total: 0, inWeek: 0, outOfWeek: 0, sampleDates: [] };
    console.log(`Source: ${source}`);
    console.log(`  Total articles in database: ${stats.total}`);
    console.log(`  Articles in week 2026-W01: ${stats.inWeek}`);
    console.log(`  Articles outside week: ${stats.outOfWeek}`);
    if (stats.sampleDates.length > 0) {
      console.log(`  Sample dates: ${stats.sampleDates.join(', ')}`);
    } else if (stats.total === 0) {
      console.log(`  ⚠️  NO ARTICLES FOUND - Source may not be fetching`);
    }
    console.log('');
  }
  
  // Print all matching sources found
  if (Object.keys(sourceStats).length > 0) {
    console.log('=== All Matching Sources Found ===\n');
    for (const [source, stats] of Object.entries(sourceStats)) {
      console.log(`Source: ${source}`);
      console.log(`  Total: ${stats.total}, In week: ${stats.inWeek}, Outside: ${stats.outOfWeek}`);
      if (stats.sampleDates.length > 0) {
        console.log(`  Sample dates: ${stats.sampleDates.join(', ')}`);
      }
      console.log('');
    }
  }
  
  // Check if articles exist but are outside the week
  console.log('\n=== Articles from new sources (outside week range) ===');
  let foundOutside = false;
  for (const article of articles) {
    if (newSources.includes(article.source)) {
      if (article.published_at) {
        const pubTime = new Date(article.published_at).getTime();
        if (pubTime < weekStart || pubTime > weekEnd) {
          if (!foundOutside) {
            foundOutside = true;
          }
          console.log(`  ${article.source}: ${article.title.substring(0, 60)}... (${article.published_at})`);
        }
      }
    }
  }
  if (!foundOutside) {
    console.log('  (none found)');
  }
}

main().catch(console.error);

