import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { buildMonthlyDigest } from '../digest/buildMonthlyDigest';
import { getTopicTotalsDisplayName, type TopicTotalsKey } from '../utils/topicNames';

// --- AI Summarization Imports & Config ---
import OpenAI from 'openai';

// Load environment variables from .env.local if it exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
} catch (err) {
  // .env.local doesn't exist or can't be read, use process.env as-is
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_MODEL = "gpt-3.5-turbo"; // Could be changed to another model if desired

/**
 * Generate a short AI summary for a single article using OpenAI.
 * Input: article title, source, published date, topic, and snippet/description.
 * Returns the summary string, or null on error or if no snippet available.
 */
export async function generateAISummaryForArticle(
  article: { title: string; source: string; published_at: string; snippet?: string },
  topicDisplayName: string
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  
  // Skip if no snippet available
  if (!article.snippet || article.snippet.trim().length === 0) {
    return null;
  }

  const date = article.published_at ? new Date(article.published_at).toISOString().split('T')[0] : '';

  const prompt = `As an AI assistant, produce a short summary (1-2 sentences) for this article based ONLY on the information provided below. Use only the title, source, date, topic, and snippet/description. DO NOT invent facts or reference information not provided. Clearly indicate this is an AI-generated summary.

Article information:
- Title: "${article.title}"
- Source: ${article.source}
- Published: ${date}
- Topic: ${topicDisplayName}
- Snippet/Description: ${article.snippet}

Generate a concise summary (1-2 sentences) that captures the key points from the snippet.`;

  // Call OpenAI API with strong error handling
  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.7,
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });
    const summary = res.choices[0]?.message?.content?.trim();
    return summary || null;
  } catch (e) {
    return null; // Do not fail the build
  }
}

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
    
    // Generate AI summaries for each Top-N article
    console.log('Generating AI summaries for articles...');
    const allTopArticles = [
      ...digest.topics.JewelleryIndustry.top.map(a => ({ article: a, topic: 'Jewellery Industry' })),
      ...digest.topics.EcommerceTechnology.top.map(a => ({ article: a, topic: 'Ecommerce Technology' })),
      ...digest.topics.AIEcommerceStrategy.top.map(a => ({ article: a, topic: 'AI & Ecommerce Strategy' })),
      ...digest.topics.LuxuryConsumerBehaviour.top.map(a => ({ article: a, topic: 'Luxury Consumer Behaviour' })),
    ];

    const summaryPromises = allTopArticles.map(({ article, topic }) =>
      generateAISummaryForArticle(article, topic).then(
        summary => { article.aiSummary = summary || undefined; }
      )
    );
    
    await Promise.all(summaryPromises);
    const generatedCount = allTopArticles.filter(({ article }) => article.aiSummary !== undefined && article.aiSummary !== null).length;
    console.log(`✓ AI summaries generated for ${generatedCount} articles\n`);
    
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

