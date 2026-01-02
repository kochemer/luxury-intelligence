/**
 * Shared function to generate AI summaries for articles in a weekly digest.
 * This ensures both CLI and API routes use the same logic.
 */

import OpenAI from 'openai';

const AI_MODEL = "gpt-3.5-turbo";
const MAX_SNIPPET_LENGTH = 800;
const MAX_OUTPUT_TOKENS = 100;
const TEMPERATURE = 0.2;

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

