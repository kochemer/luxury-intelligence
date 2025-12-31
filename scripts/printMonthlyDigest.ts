import { DateTime } from 'luxon';
import { buildMonthlyDigest } from '../digest/buildMonthlyDigest.js';
import { getTopicDisplayName, getTopicTotalsDisplayName } from '../utils/topicNames.js';

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

/**
 * Format date for display (YYYY-MM-DD)
 */
function formatDate(isoString: string): string {
  return isoString.split('T')[0];
}

/**
 * Format article for display
 */
function formatArticle(article: { title: string; published_at: string; source: string; url: string }): string {
  const date = formatDate(article.published_at);
  return `  • ${article.title}\n    ${date} | ${article.source}\n    ${article.url}`;
}

async function main() {
  const monthLabel = parseArgs();
  
  console.log(`\nBuilding digest for month: ${monthLabel}\n`);
  
  try {
    const digest = await buildMonthlyDigest(monthLabel);
    
    // Print header
    console.log(`=== ${digest.monthLabel} ===`);
    console.log(`Period: ${formatDate(digest.startISO)} to ${formatDate(digest.endISO)} (${digest.tz})`);
    console.log(`\nTotal articles: ${digest.totals.total}`);
    
    // Print totals by topic
    console.log(`\nTotals by topic:`);
    console.log(`  ${getTopicTotalsDisplayName('Jewellery')}: ${digest.totals.byTopic.Jewellery}`);
    console.log(`  ${getTopicTotalsDisplayName('Ecommerce')}: ${digest.totals.byTopic.Ecommerce}`);
    console.log(`  ${getTopicTotalsDisplayName('AIStrategy')}: ${digest.totals.byTopic.AIStrategy}`);
    console.log(`  ${getTopicTotalsDisplayName('Luxury')}: ${digest.totals.byTopic.Luxury}`);
    
    // Print top articles for each topic
    console.log(`\n=== Top Articles by Topic ===\n`);
    
    // Jewellery Industry
    console.log(`${getTopicDisplayName('JewelleryIndustry')} (${digest.topics.JewelleryIndustry.total} total, showing top ${digest.topics.JewelleryIndustry.top.length}):`);
    if (digest.topics.JewelleryIndustry.top.length > 0) {
      digest.topics.JewelleryIndustry.top.forEach(article => {
        console.log(formatArticle(article));
      });
    } else {
      console.log('  (no articles)');
    }
    console.log();
    
    // Ecommerce Technology
    console.log(`${getTopicDisplayName('EcommerceTechnology')} (${digest.topics.EcommerceTechnology.total} total, showing top ${digest.topics.EcommerceTechnology.top.length}):`);
    if (digest.topics.EcommerceTechnology.top.length > 0) {
      digest.topics.EcommerceTechnology.top.forEach(article => {
        console.log(formatArticle(article));
      });
    } else {
      console.log('  (no articles)');
    }
    console.log();
    
    // AI & Ecommerce Strategy
    console.log(`${getTopicDisplayName('AIEcommerceStrategy')} (${digest.topics.AIEcommerceStrategy.total} total, showing top ${digest.topics.AIEcommerceStrategy.top.length}):`);
    if (digest.topics.AIEcommerceStrategy.top.length > 0) {
      digest.topics.AIEcommerceStrategy.top.forEach(article => {
        console.log(formatArticle(article));
      });
    } else {
      console.log('  (no articles)');
    }
    console.log();
    
    // Luxury Consumer Behaviour
    console.log(`${getTopicDisplayName('LuxuryConsumerBehaviour')} (${digest.topics.LuxuryConsumerBehaviour.total} total, showing top ${digest.topics.LuxuryConsumerBehaviour.top.length}):`);
    if (digest.topics.LuxuryConsumerBehaviour.top.length > 0) {
      digest.topics.LuxuryConsumerBehaviour.top.forEach(article => {
        console.log(formatArticle(article));
      });
    } else {
      console.log('  (no articles)');
    }
    console.log();
    
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

