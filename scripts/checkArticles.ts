import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const articlesPath = path.join(__dirname, '../data/articles.json');
  const articles: any[] = JSON.parse(await fs.readFile(articlesPath, 'utf-8'));
  
  console.log(`Total articles in database: ${articles.length}\n`);
  
  // Check for new sources
  const newSources = [
    'MIT Sloan Management Review – AI',
    'Benedict Evans',
    'Stratechery',
    'Digital Commerce 360',
    'Vogue Business',
    'Jing Daily',
    'Luxury Society',
    'Jewellery Outlook'
  ];
  
  console.log('=== Checking for new sources ===\n');
  for (const newSource of newSources) {
    const matching = articles.filter(a => a.source === newSource);
    console.log(`${newSource}: ${matching.length} articles`);
    if (matching.length > 0) {
      const sample = matching[0];
      console.log(`  Sample: ${sample.title.substring(0, 60)}...`);
      console.log(`  Published: ${sample.published_at}`);
      console.log(`  Ingested: ${sample.ingested_at}`);
    }
  }
  
  // Get all unique sources
  const allSources = new Set(articles.map(a => a.source));
  console.log(`\n=== All sources in database (${allSources.size} total) ===`);
  Array.from(allSources).sort().forEach(s => {
    const count = articles.filter(a => a.source === s).length;
    console.log(`  ${s}: ${count} articles`);
  });
  
  // Check most recent ingestion
  const withIngested = articles.filter(a => a.ingested_at);
  if (withIngested.length > 0) {
    const sorted = withIngested.sort((a, b) => 
      new Date(b.ingested_at).getTime() - new Date(a.ingested_at).getTime()
    );
    console.log(`\n=== Most recently ingested articles ===`);
    sorted.slice(0, 5).forEach(a => {
      console.log(`  ${a.source}: ${a.title.substring(0, 50)}... (${a.ingested_at})`);
    });
  }
}

main().catch(console.error);


