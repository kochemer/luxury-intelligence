import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { buildWeeklyDigest } from '../digest/buildWeeklyDigest';
import { getTopicTotalsDisplayName, type TopicTotalsKey } from '../utils/topicNames';

// --- AI Summarization Imports & Config ---
import OpenAI from 'openai';
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
    console.error(`Env var missing: OPENAI_API_KEY not found in environment. Cannot generate AI summary for article "${article.title.substring(0, 50)}..."`);
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
  } catch (e: any) {
    // Check if error is due to missing/invalid API key
    const isMissingKey = !OPENAI_API_KEY || 
      (e?.message && (e.message.includes('api key') || e.message.includes('API key'))) ||
      (e?.status === 401);
    
    if (isMissingKey) {
      if (!OPENAI_API_KEY) {
        console.error(`Env var missing: OPENAI_API_KEY not found in environment. Cannot generate AI summary for article "${article.title.substring(0, 50)}..."`);
      } else {
        console.error(`OpenAI API error (invalid key): Cannot generate AI summary for article "${article.title.substring(0, 50)}..."`);
      }
    } else {
      // Enhanced error reporting for API errors
      const errorInfo: {
        type?: string;
        status?: number;
        message?: string;
        requestId?: string;
        code?: string;
        retryable?: boolean;
      } = {};
      
      if (e?.status) errorInfo.status = e.status;
      if (e?.message) errorInfo.message = e.message;
      if (e?.type) errorInfo.type = e.type;
      if (e?.code) errorInfo.code = e.code;
      if (e?.request_id) errorInfo.requestId = e.request_id;
      if (e?.x_request_id) errorInfo.requestId = e.x_request_id;
      
      // Determine if retryable (5xx errors, rate limits, timeouts)
      if (e?.status) {
        const status = e.status;
        errorInfo.retryable = status >= 500 || status === 429 || status === 408;
      } else if (e?.code === 'ECONNRESET' || e?.code === 'ETIMEDOUT') {
        errorInfo.retryable = true;
      }
      
      // Log error details (without sensitive data)
      console.error(`OpenAI API error for article "${article.title.substring(0, 50)}...":`, {
        model: AI_MODEL,
        ...errorInfo,
      });
    }
    
    return { summary: null, tokenUsage: null, skipped: false, failed: true }; // Do not fail the build
  }
}

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
 * Parse CLI arguments for --week flag
 */
function parseArgs(): string {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--week=')) {
      const weekLabel = arg.split('=')[1];
      // Validate format
      if (!/^\d{4}-W\d{1,2}$/.test(weekLabel)) {
        console.error(`Invalid week format: ${weekLabel}. Expected YYYY-W## (e.g. 2025-W52)`);
        process.exit(1);
      }
      return weekLabel;
    }
  }
  // Default to current week
  return getCurrentWeek();
}

async function main() {
  const weekLabel = parseArgs();
  
  console.log(`Building digest for week: ${weekLabel}\n`);
  
  try {
    // Build the digest
    const digest = await buildWeeklyDigest(weekLabel);
    
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

