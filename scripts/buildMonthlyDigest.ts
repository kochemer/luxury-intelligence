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

// Cost/safety guards
const MAX_SNIPPET_LENGTH = 800; // Truncate snippet to this length before sending
const MAX_OUTPUT_TOKENS = 100; // Cap output length (80-120 range, using 100)
const TEMPERATURE = 0.2; // Deterministic temperature (0-0.3 range, using 0.2)

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type SummaryResult = {
  summary: string | null;
  tokenUsage: TokenUsage | null;
  skipped: boolean;
  failed: boolean;
};

/**
 * Generate a short AI summary for a single article using OpenAI.
 * Input: article title, source, published date, topic, and snippet/description.
 * Returns summary result with token usage info.
 */
export async function generateAISummaryForArticle(
  article: { title: string; source: string; published_at: string; snippet?: string },
  topicDisplayName: string
): Promise<SummaryResult> {
  if (!OPENAI_API_KEY) {
    return { summary: null, tokenUsage: null, skipped: false, failed: true };
  }
  
  // Skip if no snippet available
  if (!article.snippet || article.snippet.trim().length === 0) {
    return { summary: null, tokenUsage: null, skipped: true, failed: false };
  }

  // Truncate snippet defensively to prevent excessive input
  const truncatedSnippet = article.snippet.length > MAX_SNIPPET_LENGTH
    ? article.snippet.substring(0, MAX_SNIPPET_LENGTH) + '...'
    : article.snippet;

  const date = article.published_at ? new Date(article.published_at).toISOString().split('T')[0] : '';

  const prompt = `As an AI assistant, produce a short summary (1-2 sentences) for this article based ONLY on the information provided below. Use only the title, source, date, topic, and snippet/description. DO NOT invent facts or reference information not provided. Clearly indicate this is an AI-generated summary.

Article information:
- Title: "${article.title}"
- Source: ${article.source}
- Published: ${date}
- Topic: ${topicDisplayName}
- Snippet/Description: ${truncatedSnippet}

Generate a concise summary (1-2 sentences) that captures the key points from the snippet.`;

  // Call OpenAI API with strong error handling
  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    
    const summary = res.choices[0]?.message?.content?.trim() || null;
    
    // Extract token usage if available (handle missing fields gracefully)
    const tokenUsage: TokenUsage = {};
    if (res.usage) {
      if (res.usage.prompt_tokens !== undefined) tokenUsage.prompt_tokens = res.usage.prompt_tokens;
      if (res.usage.completion_tokens !== undefined) tokenUsage.completion_tokens = res.usage.completion_tokens;
      if (res.usage.total_tokens !== undefined) tokenUsage.total_tokens = res.usage.total_tokens;
    }
    
    return {
      summary,
      tokenUsage: Object.keys(tokenUsage).length > 0 ? tokenUsage : null,
      skipped: false,
      failed: false,
    };
  } catch (e) {
    return { summary: null, tokenUsage: null, skipped: false, failed: true }; // Do not fail the build
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
    console.log(`Model: ${AI_MODEL}`);
    console.log(`Settings: max_tokens=${MAX_OUTPUT_TOKENS}, temperature=${TEMPERATURE}, max_snippet_length=${MAX_SNIPPET_LENGTH}\n`);
    
    const allTopArticles = [
      ...digest.topics.JewelleryIndustry.top.map(a => ({ article: a, topic: 'Jewellery Industry' })),
      ...digest.topics.EcommerceTechnology.top.map(a => ({ article: a, topic: 'Ecommerce Technology' })),
      ...digest.topics.AIEcommerceStrategy.top.map(a => ({ article: a, topic: 'AI & Ecommerce Strategy' })),
      ...digest.topics.LuxuryConsumerBehaviour.top.map(a => ({ article: a, topic: 'Luxury Consumer Behaviour' })),
    ];

    // Statistics tracking
    let attempted = 0;
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let callsWithTokenData = 0;

    const summaryPromises = allTopArticles.map(({ article, topic }) => {
      attempted++;
      return generateAISummaryForArticle(article, topic).then(
        (result) => {
          if (result.skipped) {
            skipped++;
            article.aiSummary = undefined;
          } else if (result.failed) {
            failed++;
            article.aiSummary = undefined;
          } else if (result.summary) {
            succeeded++;
            article.aiSummary = result.summary;
          } else {
            failed++;
            article.aiSummary = undefined;
          }
          
          // Aggregate token usage if available
          if (result.tokenUsage) {
            callsWithTokenData++;
            if (result.tokenUsage.prompt_tokens !== undefined) {
              totalPromptTokens += result.tokenUsage.prompt_tokens;
            }
            if (result.tokenUsage.completion_tokens !== undefined) {
              totalCompletionTokens += result.tokenUsage.completion_tokens;
            }
            if (result.tokenUsage.total_tokens !== undefined) {
              totalTokens += result.tokenUsage.total_tokens;
            }
          }
        }
      );
    });
    
    await Promise.all(summaryPromises);
    
    // Log statistics
    console.log('AI Summary Generation Statistics:');
    console.log(`  Attempted: ${attempted}`);
    console.log(`  Succeeded: ${succeeded}`);
    console.log(`  Skipped (no snippet): ${skipped}`);
    console.log(`  Failed: ${failed}`);
    
    if (callsWithTokenData > 0) {
      if (totalTokens > 0) {
        console.log(`  Total tokens: ${totalTokens} (prompt: ${totalPromptTokens}, completion: ${totalCompletionTokens})`);
        console.log(`  Average tokens per call: ${Math.round(totalTokens / callsWithTokenData)}`);
      } else if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
        console.log(`  Token usage: prompt=${totalPromptTokens}, completion=${totalCompletionTokens}`);
        const estimatedTotal = totalPromptTokens + totalCompletionTokens;
        console.log(`  Estimated total tokens: ${estimatedTotal}`);
        console.log(`  Average tokens per call: ${Math.round(estimatedTotal / callsWithTokenData)}`);
      } else {
        console.log(`  Token usage data: available for ${callsWithTokenData} calls, but values not present in response`);
      }
    } else {
      console.log(`  Token usage: not available in API responses`);
    }
    console.log('');
    
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

