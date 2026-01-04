import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const articlesPath = path.join(__dirname, '../data/articles.json');
  const articles: any[] = JSON.parse(await fs.readFile(articlesPath, 'utf-8'));
  
  const undefinedSources = articles.filter(a => !a.source || a.source === 'undefined');
  console.log(`Found ${undefinedSources.length} articles with undefined source\n`);
  
  // Check URLs to identify which sources they might be from
  const newSourceUrls = {
    'MIT Sloan Management Review – AI': 'sloanreview.mit.edu',
    'Benedict Evans': 'ben-evans.com',
    'Stratechery': 'stratechery.com',
    'Digital Commerce 360': 'digitalcommerce360.com',
    'Vogue Business': 'voguebusiness.com',
    'Jing Daily': 'jingdaily.com',
    'Luxury Society': 'luxurysociety.com',
    'Jewellery Outlook': 'jewelleryoutlook.com'
  };
  
  console.log('=== Analyzing undefined source articles ===\n');
  
  for (const [sourceName, urlPattern] of Object.entries(newSourceUrls)) {
    const matching = undefinedSources.filter(a => 
      a.url && a.url.toLowerCase().includes(urlPattern.toLowerCase())
    );
    if (matching.length > 0) {
      console.log(`${sourceName}: ${matching.length} articles found`);
      console.log(`  Sample URL: ${matching[0].url}`);
      console.log(`  Sample title: ${matching[0].title.substring(0, 60)}...`);
      console.log(`  Published: ${matching[0].published_at}`);
      console.log('');
    }
  }
  
  // Show sample of undefined articles
  console.log('=== Sample of undefined source articles ===\n');
  undefinedSources.slice(0, 10).forEach(a => {
    console.log(`  URL: ${a.url}`);
    console.log(`  Title: ${a.title.substring(0, 60)}...`);
    console.log(`  Published: ${a.published_at}`);
    console.log('');
  });
  
  // Check week range for undefined articles
  const weekStart = new Date('2025-12-28T23:00:00.000Z').getTime();
  const weekEnd = new Date('2026-01-04T22:59:59.999Z').getTime();
  
  const inWeek = undefinedSources.filter(a => {
    if (!a.published_at) return false;
    const pubTime = new Date(a.published_at).getTime();
    return pubTime >= weekStart && pubTime <= weekEnd;
  });
  
  console.log(`\n=== Week 2026-W01 Analysis ===`);
  console.log(`Undefined source articles in week: ${inWeek.length} out of ${undefinedSources.length}`);
}

main().catch(console.error);

