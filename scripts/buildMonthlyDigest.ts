import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { buildMonthlyDigest } from '../digest/buildMonthlyDigest';
import { getTopicTotalsDisplayName, type TopicTotalsKey } from '../utils/topicNames';

// --- AI Summarization Imports & Config ---
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_MODEL = "gpt-3.5-turbo"; // Could be changed to another model if desired

/**
 * Generate a short AI summary for a topic using OpenAI, based only on the 7 most recent titles/sources/dates.
 * Returns the summary string, or null on error.
 */
export async function generateAISummaryForTopic(topicKey: TopicTotalsKey, articles: any[]): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  // Only use the top 7 articles (if any)
  const items = articles.slice(0, 7);

  if (items.length === 0) return null;

  // Compose a prompt containing only titles, sources, dates for context:
  const bulletList = items.map(
    (item: any, i: number) => {
      const date = item.published_at ? new Date(item.published_at).toISOString().split('T')[0] : '';
      return `${i + 1}. "${item.title}" (${item.source}${date ? ", " + date : ""})`;
    }
  ).join('\n');
  const displayName = getTopicTotalsDisplayName(topicKey) || topicKey;

  const prompt = `As an AI assistant, produce a short summary (2-4 sentences) about the following collection of headlines for the topic "${displayName}" for the given month. Only use the info from headlines, sources, and dates below. DO NOT reference any articles you don't know, and do not invent facts or extra details. Make it clear the summary is AI-generated.
  
Headlines:
${bulletList}

(Write as if for a newsletter digest, clearly label as "AI summary:")`;

  // Call OpenAI API with strong error handling
  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.7,
      max_tokens: 220,
      messages: [{ role: "user", content: prompt }],
    });
    const summary = res.choices[0]?.message?.content?.trim();
    // Always label as AI
    return summary
      ? `AI summary: ${summary.replace(/^AI summary:/i, "").trim()}`
      : null;
  } catch (e) {
    return null; // Do not fail the build
  }
}

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
    
    // Generate AI summaries for each topic
    console.log('Generating AI summaries...');
    const summaryPromises = [
      generateAISummaryForTopic('Jewellery', digest.topics.JewelleryIndustry.top).then(
        summary => { digest.topics.JewelleryIndustry.aiSummary = summary || undefined; }
      ),
      generateAISummaryForTopic('Ecommerce', digest.topics.EcommerceTechnology.top).then(
        summary => { digest.topics.EcommerceTechnology.aiSummary = summary || undefined; }
      ),
      generateAISummaryForTopic('AIStrategy', digest.topics.AIEcommerceStrategy.top).then(
        summary => { digest.topics.AIEcommerceStrategy.aiSummary = summary || undefined; }
      ),
      generateAISummaryForTopic('Luxury', digest.topics.LuxuryConsumerBehaviour.top).then(
        summary => { digest.topics.LuxuryConsumerBehaviour.aiSummary = summary || undefined; }
      ),
    ];
    
    await Promise.all(summaryPromises);
    console.log('✓ AI summaries generated\n');
    
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

