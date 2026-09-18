/**
 * Shared function to generate AI summaries for articles in a weekly digest.
 * This ensures both CLI and API routes use the same logic.
 */

import OpenAI from 'openai';
import { getModelFor, maxTokensParam, temperatureParam } from '../lib/llm/models';

const AI_MODEL = process.env.ARTICLE_SUMMARY_MODEL || getModelFor('summarize');
const MAX_SNIPPET_LENGTH = 800;
const MAX_OUTPUT_TOKENS = 100;
const TEMPERATURE = 0.2;
/** Soft ceiling from the prompt; longer output is kept but logged. */
const TARGET_MAX_WORDS = 25;

/**
 * Normalise model output before it is stored: drop any assistant-style
 * preamble/label the model still emits, unwrap quotes, collapse whitespace.
 * (ArticleCard strips the old "AI-generated summary:" prefix at render time too,
 * but that is a safety net — the JSON, email, llms.txt and JSON-LD all read the
 * raw field.)
 */
export function cleanSummaryText(raw: string): string {
  let s = raw.trim();
  // Labels / disclaimers the old prompt trained us to expect.
  s = s.replace(/^\*\*(?:AI[- ]generated summary|AI summary|Summary)\s*[:\-–—]?\s*\*\*\s*[:\-–—]?\s*/i, '');
  s = s.replace(/^(?:AI[- ]generated summary|AI summary|Summary)\s*[:\-–—]\s*/i, '');
  s = s.replace(/^(?:this is an )?AI[- ]generated summary[.:]?\s*/i, '');
  // Wrapping quotes.
  s = s.replace(/^["“'‘]([\s\S]*)["”'’]$/, '$1');
  // Whitespace.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

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

type Article = {
  title: string;
  source: string;
  published_at: string;
  snippet?: string;
  aiSummary?: string;
};

async function generateAISummaryForArticle(
  article: Article,
  topicDisplayName: string
): Promise<SummaryResult> {
  // Read API key dynamically to ensure it's available after env vars are loaded
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
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

  const prompt = `You write one-line story summaries for a weekly intelligence digest read by luxury, jewellery and retail executives. Readers scan dozens of these; each one must earn its place.

Write ONE sentence, maximum ${TARGET_MAX_WORDS} words, summarising the article below.

Rules:
- Lead with the fact. The first words are the news itself (who did what, what changed, what the number is) — never the source, the date, or "the article".
- Include at least one concrete anchor: a number, a named company/person/product, or a decision taken.
- Use only the information given below. Do not invent, extrapolate, or add context that is not there.
- No preamble, label, disclaimer or hedging: never "AI-generated", "this article", "the piece discusses", "according to", "highlights", "explores".
- No wrapping quotes, no bullet, no trailing commentary. Output the sentence and nothing else.

Article (${topicDisplayName} section):
Title: ${article.title}
Source: ${article.source}
Published: ${date}
Description: ${truncatedSnippet}

Example of the required style (unrelated story): "Richemont's jewellery maisons grew sales 11% in Q1 as Cartier demand offset a 7% drop in watches."`;

  // Call OpenAI API with strong error handling
  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: AI_MODEL,
      ...temperatureParam(AI_MODEL, TEMPERATURE),
      ...maxTokensParam(AI_MODEL, MAX_OUTPUT_TOKENS),
      messages: [{ role: "user", content: prompt }],
    });
    
    const rawSummary = res.choices[0]?.message?.content?.trim() || '';
    const summary = rawSummary ? cleanSummaryText(rawSummary) || null : null;
    if (summary) {
      const words = summary.split(/\s+/).length;
      if (words > TARGET_MAX_WORDS + 10) {
        console.warn(`[Summaries] ${words}-word summary (target ≤${TARGET_MAX_WORDS}) for "${article.title.substring(0, 50)}..."`);
      }
    }
    
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
    // Re-read API key for error checking (in case it changed)
    const apiKey = process.env.OPENAI_API_KEY;
    
    // Check if error is due to missing/invalid API key
    const isMissingKey = !apiKey || 
      (e?.message && (e.message.includes('api key') || e.message.includes('API key'))) ||
      (e?.status === 401);
    
    if (isMissingKey) {
      if (!apiKey) {
        console.error(`Env var missing: OPENAI_API_KEY not found in environment. Cannot generate AI summary for article "${article.title.substring(0, 50)}..."`);
      } else {
        console.error(`OpenAI API error (invalid key): Cannot generate AI summary for article "${article.title.substring(0, 50)}..."`);
      }
    } else {
      console.error(`OpenAI API error for article "${article.title.substring(0, 50)}...":`, {
        model: AI_MODEL,
        status: e?.status,
        message: e?.message,
      });
    }
    
    return { summary: null, tokenUsage: null, skipped: false, failed: true };
  }
}

/**
 * Generate AI summaries for all top articles in a weekly digest.
 * Modifies articles in-place by setting article.aiSummary.
 * 
 * @param digest - The weekly digest object (will be modified in-place)
 * @returns Statistics about summary generation
 */
export async function generateSummariesForDigest(digest: {
  topics: {
    AI_and_Strategy: { top: Article[] };
    Ecommerce_Retail_Tech: { top: Article[] };
    Luxury_and_Consumer: { top: Article[] };
    Jewellery_Industry: { top: Article[] };
  };
}): Promise<{ succeeded: number; skipped: number; failed: number }> {
  const allTopArticles = [
    ...digest.topics.AI_and_Strategy.top.map(a => ({ article: a, topic: 'AI & Strategy' })),
    ...digest.topics.Ecommerce_Retail_Tech.top.map(a => ({ article: a, topic: 'Ecommerce & Retail Tech' })),
    ...digest.topics.Luxury_and_Consumer.top.map(a => ({ article: a, topic: 'Luxury & Consumer' })),
    ...digest.topics.Jewellery_Industry.top.map(a => ({ article: a, topic: 'Jewellery Industry' })),
  ];

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  const summaryPromises = allTopArticles.map(({ article, topic }) => {
    return generateAISummaryForArticle(article, topic).then(
      (result) => {
        // Directly modify the article object in the digest (article is a reference)
        if (result.summary) {
          article.aiSummary = result.summary;
          succeeded++;
        } else if (result.skipped) {
          // Don't set anything - leave aiSummary undefined (JSON.stringify omits undefined)
          skipped++;
        } else {
          // Don't set anything - leave aiSummary undefined (JSON.stringify omits undefined)
          failed++;
        }
      }
    );
  });
  
  await Promise.all(summaryPromises);
  
  return { succeeded, skipped, failed };
}

