import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { buildWeeklyDigest } from '../digest/buildWeeklyDigest';
import { getTopicTotalsDisplayName, type TopicTotalsKey } from '../utils/topicNames';
import { generateSummariesForDigest } from '../digest/generateSummaries';
import { generateWeeklyCoverImage } from '../digest/generateCoverImage';
import { getTopicDisplayName } from '../utils/topicNames';

// --- Environment Variable Loading for CLI ---
import { parse } from 'dotenv';

// Load environment variables from .env.local for Node CLI script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.local');
let envResult: { error?: Error; parsed?: Record<string, string> } = { parsed: {} };
try {
  const buffer = readFileSync(envPath);
  // Detect encoding: check for UTF-16 BOM (FE FF for BE, FF FE for LE)
  let contentToParse: string;
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    // UTF-16 LE BOM
    contentToParse = buffer.toString('utf16le', 2);
  } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    // UTF-16 BE BOM - convert to LE for processing
    const leBuffer = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i < buffer.length; i += 2) {
      leBuffer[i - 2] = buffer[i + 1];
      leBuffer[i - 1] = buffer[i];
    }
    contentToParse = leBuffer.toString('utf16le');
  } else if (buffer.length > 0 && buffer[1] === 0 && buffer[0] !== 0) {
    // UTF-16 LE without BOM (every other byte is null)
    contentToParse = buffer.toString('utf16le');
  } else {
    // Assume UTF-8
    contentToParse = buffer.toString('utf-8');
  }
  const parsed = parse(contentToParse);
  Object.assign(process.env, parsed);
  envResult.parsed = parsed;
} catch (err) {
  envResult.error = err as Error;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Diagnostic logging (startup check)
console.log('AI Configuration Check:');
if (envResult.error) {
  console.log(`  .env.local file: not found or error loading`);
} else {
  console.log(`  .env.local file: loaded successfully`);
}
if (!OPENAI_API_KEY) {
  console.log(`  OPENAI_API_KEY: missing (not in .env.local or process.env)`);
} else {
  console.log(`  OPENAI_API_KEY: present`);
}
console.log('');

/**
 * Get the current week in Europe/Copenhagen timezone (format: YYYY-W##)
 */
function getCurrentWeek(): string {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const year = now.year;
  const weekNumber = now.weekNumber;
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Parse CLI arguments for --week, --regenCover, and --coverStyle flags
 */
function parseArgs(): { weekLabel: string; regenCover: boolean; coverStyle: 'realistic' | 'illustration' } {
  const args = process.argv.slice(2);
  let weekLabel: string | null = null;
  let regenCover = false;
  let coverStyle: 'realistic' | 'illustration' = 'realistic';
  
  for (const arg of args) {
    if (arg.startsWith('--week=')) {
      weekLabel = arg.split('=')[1];
      // Validate format
      if (!/^\d{4}-W\d{1,2}$/.test(weekLabel)) {
        console.error(`Invalid week format: ${weekLabel}. Expected YYYY-W## (e.g. 2025-W52)`);
        process.exit(1);
      }
    } else if (arg === '--regenCover' || arg === '--regenCover=true') {
      regenCover = true;
    } else if (arg.startsWith('--coverStyle=')) {
      const style = arg.split('=')[1];
      if (style === 'realistic' || style === 'illustration') {
        coverStyle = style;
      } else {
        console.warn(`Invalid cover style: ${style}. Using default: realistic`);
      }
    }
  }
  
  return {
    weekLabel: weekLabel || getCurrentWeek(),
    regenCover,
    coverStyle,
  };
}

async function main() {
  const { weekLabel, regenCover, coverStyle } = parseArgs();
  
  console.log(`Building digest for week: ${weekLabel}`);
  if (regenCover) {
    console.log(`  (regenerating cover image if it exists, style: ${coverStyle})\n`);
  } else {
    console.log(`  (cover style: ${coverStyle})\n`);
  }
  
  try {
    // Build the digest
    const digest = await buildWeeklyDigest(weekLabel);
    
    // Generate AI summaries for each Top-N article using shared function
    console.log('Generating AI summaries for articles...');
    const stats = await generateSummariesForDigest(digest);
    
    // Log statistics
    console.log('AI Summary Generation Statistics:');
    const totalAttempted = stats.succeeded + stats.skipped + stats.failed;
    console.log(`  Attempted: ${totalAttempted}`);
    console.log(`  Succeeded: ${stats.succeeded}`);
    console.log(`  Skipped (no snippet): ${stats.skipped}`);
    console.log(`  Failed: ${stats.failed}`);
    console.log('');
    
    // Generate cover image
    console.log('Generating cover image...');
    const categories = [
      {
        name: getTopicDisplayName('AI_and_Strategy'),
        articles: digest.topics.AI_and_Strategy.top.map(a => ({ title: a.title, source: a.source })),
      },
      {
        name: getTopicDisplayName('Ecommerce_Retail_Tech'),
        articles: digest.topics.Ecommerce_Retail_Tech.top.map(a => ({ title: a.title, source: a.source })),
      },
      {
        name: getTopicDisplayName('Luxury_and_Consumer'),
        articles: digest.topics.Luxury_and_Consumer.top.map(a => ({ title: a.title, source: a.source })),
      },
      {
        name: getTopicDisplayName('Jewellery_Industry'),
        articles: digest.topics.Jewellery_Industry.top.map(a => ({ title: a.title, source: a.source })),
      },
    ];
    
    const coverResult = await generateWeeklyCoverImage(weekLabel, categories, regenCover, coverStyle);
    
    // Update digest with cover image info
    if (coverResult.success && coverResult.imagePath) {
      digest.coverImageUrl = coverResult.imagePath;
      digest.coverImageAlt = `Weekly cover illustration for ${weekLabel}`;
      digest.coverKeywords = coverResult.keywords;
      console.log(`✓ Cover image: ${coverResult.imagePath}`);
    } else {
      // Fallback to placeholder
      digest.coverImageUrl = '/weekly-images/placeholder.svg';
      digest.coverImageAlt = `Weekly digest cover for ${weekLabel}`;
      digest.coverKeywords = [];
      console.log('⚠ Using placeholder cover image');
    }
    console.log('');
    
    // Ensure output directory exists
    const outputDir = path.join(__dirname, '../data/digests');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Write JSON file
    const outputPath = path.join(outputDir, `${weekLabel}.json`);
    await fs.writeFile(
      outputPath,
      JSON.stringify(digest, null, 2),
      'utf-8'
    );
    
    // Log results
    console.log(`✓ Digest written to: ${outputPath}`);
    console.log(`\nSummary:`);
    console.log(`  Total articles: ${digest.totals.total}`);
    console.log(`  ${getTopicTotalsDisplayName('AIStrategy')}: ${digest.totals.byTopic.AIStrategy}`);
    console.log(`  ${getTopicTotalsDisplayName('EcommerceRetail')}: ${digest.totals.byTopic.EcommerceRetail}`);
    console.log(`  ${getTopicTotalsDisplayName('LuxuryConsumer')}: ${digest.totals.byTopic.LuxuryConsumer}`);
    console.log(`  ${getTopicTotalsDisplayName('Jewellery')}: ${digest.totals.byTopic.Jewellery}`);
    
  } catch (err) {
    console.error('Error building digest:', err);
    process.exit(1);
  }
}

// Run if invoked directly
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

