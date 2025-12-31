import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { buildMonthlyDigest } from '../digest/buildMonthlyDigest.js';
import { getTopicTotalsDisplayName } from '../utils/topicNames.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the current month in Europe/Copenhagen timezone
 */
function getPreviousMonth(): string {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  return now.toFormat('yyyy-MM');
}

/**
 * Parse CLI arguments for --month flag
 */
function parseArgs(): string {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--month=')) {
      const monthLabel = arg.split('=')[1];
      // Validate format
      if (!/^\d{4}-\d{2}$/.test(monthLabel)) {
        console.error(`Invalid month format: ${monthLabel}. Expected YYYY-MM`);
        process.exit(1);
      }
      return monthLabel;
    }
  }
  // Default to current month
  return getPreviousMonth();
}

async function main() {
  const monthLabel = parseArgs();
  
  console.log(`Building digest for month: ${monthLabel}\n`);
  
  try {
    // Build the digest
    const digest = await buildMonthlyDigest(monthLabel);
    
    // Ensure output directory exists
    const outputDir = path.join(__dirname, '../data/digests');
    await fs.mkdir(outputDir, { recursive: true });
    
    // Write JSON file
    const outputPath = path.join(outputDir, `${monthLabel}.json`);
    await fs.writeFile(
      outputPath,
      JSON.stringify(digest, null, 2),
      'utf-8'
    );
    
    // Log results
    console.log(`✓ Digest written to: ${outputPath}`);
    console.log(`\nSummary:`);
    console.log(`  Total articles: ${digest.totals.total}`);
    console.log(`  ${getTopicTotalsDisplayName('Jewellery')}: ${digest.totals.byTopic.Jewellery}`);
    console.log(`  ${getTopicTotalsDisplayName('Ecommerce')}: ${digest.totals.byTopic.Ecommerce}`);
    console.log(`  ${getTopicTotalsDisplayName('AIStrategy')}: ${digest.totals.byTopic.AIStrategy}`);
    console.log(`  ${getTopicTotalsDisplayName('Luxury')}: ${digest.totals.byTopic.Luxury}`);
    
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

