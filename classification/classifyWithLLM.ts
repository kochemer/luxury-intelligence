/**
 * LLM-based article classifier with caching and deterministic output.
 * Falls back to rule-based classification on failure.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import OpenAI from 'openai';
import type { Topic } from './classifyTopics';
import { classifyTopic } from './classifyTopics';

// --- Configuration ---

const CLASSIFIER_VERSION = 'llm-v1';
const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || 'gpt-3.5-turbo';
const TEMPERATURE = 0; // Deterministic
const MAX_TOKENS = 150;
const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/classification_cache.json');
const DRY_RUN = process.env.CLASSIFIER_DRY_RUN === 'true';

// --- Types ---

export type ClassificationResult = {
  category: Topic;
  confidence: number; // 0-1
  rationale?: string;
  classifier_version: string;
  from_cache: boolean;
  from_fallback: boolean;
};

type CacheEntry = {
  category: Topic;
  confidence: number;
  rationale?: string;
  classifier_version: string;
  cached_at: string;
};

type ClassificationCache = {
  [url: string]: CacheEntry;
};

// --- Cache Management ---

async function loadCache(): Promise<ClassificationCache> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // Cache file doesn't exist yet, return empty cache
      return {};
    }
    console.warn(`[Classifier] Failed to load cache: ${err.message}`);
    return {};
  }
}

async function saveCache(cache: ClassificationCache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`[Classifier] Failed to save cache: ${err.message}`);
  }
}

function getCacheKey(article: { url: string; title: string; snippet?: string }): string {
  // Use canonical URL as primary key
  // Normalize URL: remove trailing slashes, convert to lowercase for domain
  try {
    const urlObj = new URL(article.url);
    const normalizedUrl = `${urlObj.protocol}//${urlObj.hostname.toLowerCase()}${urlObj.pathname.replace(/\/$/, '')}${urlObj.search}`;
    
    // Optional: add hash of title+snippet to detect content changes
    // For now, we'll use URL only for simplicity (can be enhanced later)
    return normalizedUrl;
  } catch {
    // If URL parsing fails, use original URL
    return article.url;
  }
}

// --- LLM Classification ---

function buildClassificationPrompt(article: { title: string; source: string; snippet?: string }): string {
  const snippet = article.snippet || '';
  const snippetText = snippet.length > 500 ? snippet.substring(0, 500) + '...' : snippet;
  
  return `You are a content classifier. Classify this article into exactly ONE of these 4 categories:

1. **AI_and_Strategy**: Articles about artificial intelligence, machine learning, AI strategy, LLMs, automation, AI-driven business decisions, AI personalization, AI algorithms. Examples: "How AI is transforming retail", "LLM applications in ecommerce", "Machine learning for customer insights".

2. **Ecommerce_Retail_Tech**: Articles about online shopping, ecommerce platforms, retail technology, checkout systems, payment processing, fulfillment, logistics, omnichannel retail, marketplace platforms. Examples: "Shopify launches new features", "Retail logistics innovation", "Ecommerce conversion optimization".

3. **Luxury_and_Consumer**: Articles about luxury brands, fashion brands, consumer goods, high-end retail, luxury market trends, premium products, luxury consumer behavior, fashion industry. Examples: "Luxury consumer spending trends", "Fashion brand strategy", "Luxury brand loyalty".

4. **Jewellery_Industry**: Articles specifically about jewelry, diamonds, gemstones, watches, luxury jewelry brands (Cartier, Tiffany, Bulgari, etc.), jewelry retail, jewelry manufacturing, horology. Examples: "Diamond market trends", "Cartier launches new collection", "Jewelry industry news".

Article to classify:
- Title: "${article.title}"
- Source: ${article.source}
${snippetText ? `- Description/Snippet: ${snippetText}` : ''}

Respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "category": "AI_and_Strategy" | "Ecommerce_Retail_Tech" | "Luxury_and_Consumer" | "Jewellery_Industry",
  "confidence": 0.85,
  "rationale": "Brief 1-sentence explanation"
}

Choose the category that best fits the article's primary focus.`;
}

async function callLLMClassifier(
  article: { title: string; source: string; snippet?: string }
): Promise<{ category: Topic; confidence: number; rationale?: string } | null> {
  if (DRY_RUN) {
    console.log(`[Classifier] DRY RUN: Would classify "${article.title.substring(0, 50)}..."`);
    return null;
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[Classifier] OPENAI_API_KEY not found, skipping LLM classification`);
    return null;
  }

  const prompt = buildClassificationPrompt(article);

  // Increment llm_calls counter right before making the API call
  // This ensures we only count actual API calls, not DRY_RUN or missing API key cases
  stats.llm_calls++;

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: CLASSIFIER_MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content: 'You are a precise content classifier. Always respond with valid JSON only, no markdown formatting, no code blocks, just raw JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      // Note: response_format only works with certain models (gpt-4-turbo, gpt-3.5-turbo-1106+)
      // For older models, we'll parse the response manually
      ...(CLASSIFIER_MODEL.includes('gpt-4') || CLASSIFIER_MODEL.includes('1106') 
        ? { response_format: { type: 'json_object' } }
        : {}),
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      console.warn(`[Classifier] Empty response from LLM for article: ${article.title.substring(0, 50)}`);
      return null;
    }

    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw parseErr;
      }
    }

    // Validate response schema
    const category = parsed.category;
    const confidence = parsed.confidence;
    const rationale = parsed.rationale;

    if (!category || typeof category !== 'string') {
      console.warn(`[Classifier] Invalid category in LLM response: ${category}`);
      return null;
    }

    // Validate category is one of the 4 valid topics
    const validTopics: Topic[] = [
      'AI_and_Strategy',
      'Ecommerce_Retail_Tech',
      'Luxury_and_Consumer',
      'Jewellery_Industry',
    ];
    if (!validTopics.includes(category as Topic)) {
      console.warn(`[Classifier] Invalid category value: ${category}`);
      return null;
    }

    // Validate confidence
    let confValue = confidence;
    if (typeof confidence === 'string') {
      // Handle "0.85" as string
      confValue = parseFloat(confidence);
    }
    if (typeof confValue !== 'number' || isNaN(confValue) || confValue < 0 || confValue > 1) {
      // Default to 0.8 if invalid
      confValue = 0.8;
    }

    return {
      category: category as Topic,
      confidence: confValue,
      rationale: typeof rationale === 'string' ? rationale : undefined,
    };
  } catch (err: any) {
    console.warn(`[Classifier] LLM API error for "${article.title.substring(0, 50)}...": ${err.message}`);
    return null;
  }
}

// --- Main Classification Function ---

export type ClassificationStats = {
  total: number;
  cache_hits: number;
  cache_misses: number;
  llm_calls: number;
  llm_successes: number;
  llm_failures: number;
  fallbacks: number;
};

let stats: ClassificationStats = {
  total: 0,
  cache_hits: 0,
  cache_misses: 0,
  llm_calls: 0,
  llm_successes: 0,
  llm_failures: 0,
  fallbacks: 0,
};

export function getClassificationStats(): ClassificationStats {
  return { ...stats };
}

export function resetClassificationStats(): void {
  stats = {
    total: 0,
    cache_hits: 0,
    cache_misses: 0,
    llm_calls: 0,
    llm_successes: 0,
    llm_failures: 0,
    fallbacks: 0,
  };
}

export async function classifyArticleLLM(
  article: { title: string; url: string; source: string; snippet?: string }
): Promise<ClassificationResult> {
  stats.total++;

  const cacheKey = getCacheKey(article);
  const cache = await loadCache();

  // Check cache
  const cached = cache[cacheKey];
  if (cached && cached.classifier_version === CLASSIFIER_VERSION) {
    stats.cache_hits++;
    return {
      category: cached.category,
      confidence: cached.confidence,
      rationale: cached.rationale,
      classifier_version: CLASSIFIER_VERSION,
      from_cache: true,
      from_fallback: false,
    };
  }

  stats.cache_misses++;

  // Try LLM classification
  const llmResult = await callLLMClassifier(article);
  
  if (llmResult) {
    stats.llm_successes++;
    
    // Save to cache
    cache[cacheKey] = {
      category: llmResult.category,
      confidence: llmResult.confidence,
      rationale: llmResult.rationale,
      classifier_version: CLASSIFIER_VERSION,
      cached_at: new Date().toISOString(),
    };
    await saveCache(cache);

    return {
      category: llmResult.category,
      confidence: llmResult.confidence,
      rationale: llmResult.rationale,
      classifier_version: CLASSIFIER_VERSION,
      from_cache: false,
      from_fallback: false,
    };
  }

  // LLM failed, fall back to rule-based classifier
  stats.llm_failures++;
  stats.fallbacks++;
  
  const fallbackCategory = classifyTopic(article);
  
  console.warn(
    `[Classifier] LLM classification failed for "${article.title.substring(0, 50)}...", using fallback: ${fallbackCategory}`
  );

  return {
    category: fallbackCategory,
    confidence: 0.5, // Lower confidence for fallback
    rationale: 'Fallback to rule-based classifier',
    classifier_version: CLASSIFIER_VERSION,
    from_cache: false,
    from_fallback: true,
  };
}

