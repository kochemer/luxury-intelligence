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

const CLASSIFIER_VERSION = 'llm-v2'; // Updated version for frontier AI focus
const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || 'gpt-4o-mini';
const TEMPERATURE = 0; // Deterministic
const MAX_TOKENS = 150;
const CONFIDENCE_THRESHOLD = 0.55; // If LLM confidence < this, use keyword fallback
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

function buildClassificationPrompt(article: { title: string; source: string; snippet?: string; categoryHint?: string }): string {
  const snippet = article.snippet || '';
  const snippetText = snippet.length > 500 ? snippet.substring(0, 500) + '...' : snippet;
  const hintText = article.categoryHint ? `\n\nNote: This article comes from a source typically associated with ${article.categoryHint}. Use this as context, but classify based on the article's actual content.` : '';
  
  return `You are a content classifier. Classify this article into exactly ONE of these 4 categories:${hintText}

1. **AI_and_Strategy** (Artificial Intelligence News): Articles about frontier AI research, model development, benchmarks, LLM companies, AI infrastructure, and cutting-edge AI technology. Focus on: model releases, benchmarks (MMLU, GPQA, GSM8K, etc.), training compute, inference costs, AI company news (OpenAI, Anthropic, Google DeepMind, etc.), scaling laws, alignment research, multimodal AI, reasoning capabilities, agent systems. DO NOT include: AI business applications, AI personalization for retail, AI-driven pricing strategies, AI customer service tools (these belong in Ecommerce_Retail_Tech). Examples: "GPT-5 achieves new SOTA on MMLU", "Anthropic raises $4B funding", "New scaling laws for LLM training", "Claude 3.5 Sonnet benchmark results".

2. **Ecommerce_Retail_Tech**: Articles about online shopping, ecommerce platforms, retail technology, checkout systems, payment processing, fulfillment, logistics, omnichannel retail, marketplace platforms, AI applications in retail/ecommerce (personalization, pricing, recommendations, customer service). Examples: "Shopify launches new features", "Retail logistics innovation", "Ecommerce conversion optimization", "AI personalization for online stores", "Dynamic pricing algorithms for ecommerce".

3. **Luxury_and_Consumer** (Fashion & Luxury): Articles about luxury brands, fashion brands, consumer goods, high-end retail, luxury market trends, premium products, luxury consumer behavior, fashion industry. Examples: "Luxury consumer spending trends", "Fashion brand strategy", "Luxury brand loyalty", "High-end retail innovations".

4. **Jewellery_Industry**: Articles specifically about jewelry, diamonds, gemstones, watches, luxury jewelry brands (Cartier, Tiffany, Bulgari, etc.), jewelry retail, jewelry manufacturing, horology. Examples: "Diamond market trends", "Cartier launches new collection", "Jewelry industry news", "Luxury watch market analysis".

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

Choose the category that best fits the article's primary focus. Be precise: if an article is about AI business applications in retail, classify as Ecommerce_Retail_Tech, not AI_and_Strategy.`;
}

async function callLLMClassifier(
  article: { title: string; source: string; snippet?: string; categoryHint?: string }
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
      // Note: response_format works with gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo-1106+
      // For older models, we'll parse the response manually
      ...(CLASSIFIER_MODEL.includes('gpt-4') || CLASSIFIER_MODEL.includes('1106') || CLASSIFIER_MODEL.includes('gpt-4o')
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
  article: { title: string; url: string; source: string; snippet?: string; categoryHint?: string }
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
    
    // Confidence guardrail: if confidence < threshold, use keyword fallback with categoryHint tie-breaker
    if (llmResult.confidence < CONFIDENCE_THRESHOLD) {
      console.warn(
        `[Classifier] LLM confidence ${llmResult.confidence} < ${CONFIDENCE_THRESHOLD} for "${article.title.substring(0, 50)}...", using keyword fallback`
      );
      
      const keywordCategory = classifyTopic(article);
      const keywordMatches = countKeywordMatches(article, keywordCategory);
      
      // If categoryHint exists and matches a valid category, use it as tie-breaker
      let finalCategory = keywordCategory;
      let rationale = `LLM confidence too low (${llmResult.confidence.toFixed(2)}), overridden by keyword matching (${keywordMatches} matches)`;
      
      if (article.categoryHint) {
        const hintToTopic: Record<string, Topic> = {
          'Fashion & Luxury': 'Luxury_and_Consumer',
          'Jewellery Industry': 'Jewellery_Industry',
        };
        const hintTopic = hintToTopic[article.categoryHint];
        
        if (hintTopic && keywordMatches < 2) {
          // If keyword matches are weak, prefer categoryHint
          finalCategory = hintTopic;
          rationale = `LLM confidence too low (${llmResult.confidence.toFixed(2)}), using categoryHint (${article.categoryHint}) as tie-breaker`;
        } else if (hintTopic === keywordCategory) {
          rationale += `, categoryHint (${article.categoryHint}) confirms keyword match`;
        }
      }
      
      // Use keyword result with low confidence
      return {
        category: finalCategory,
        confidence: 0.3, // Slightly higher confidence when categoryHint is used
        rationale,
        classifier_version: CLASSIFIER_VERSION,
        from_cache: false,
        from_fallback: true,
      };
    }
    
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
  const keywordMatches = countKeywordMatches(article, fallbackCategory);
  
  console.warn(
    `[Classifier] LLM classification failed for "${article.title.substring(0, 50)}...", using keyword fallback: ${fallbackCategory} (${keywordMatches} matches)`
  );

  // Determine confidence based on keyword match strength
  let fallbackConfidence = 0.2; // Default low confidence
  if (keywordMatches >= 2) {
    fallbackConfidence = 0.4; // Medium confidence for strong keyword matches
  } else if (keywordMatches === 1) {
    fallbackConfidence = 0.3; // Slightly higher for single match
  }

  return {
    category: fallbackCategory,
    confidence: fallbackConfidence,
    rationale: `LLM failed, fallback to keyword-based classifier (${keywordMatches} keyword matches)`,
    classifier_version: CLASSIFIER_VERSION,
    from_cache: false,
    from_fallback: true,
  };
}

// Helper function to count keyword matches for a given category
// Uses simplified keyword lists for counting (not full classification logic)
function countKeywordMatches(
  article: { title: string; source: string },
  category: Topic
): number {
  const titleAndSource = `${article.title} ${article.source}`.toLowerCase();
  
  // Simplified keyword lists for match counting
  const categoryKeywords: Record<Topic, string[]> = {
    "Jewellery_Industry": ["jewel", "jewellery", "jewelry", "diamond", "gold", "silver", "gem", "cartier", "tiffany", "bulgari", "gemstone", "carat", "horology"],
    "Luxury_and_Consumer": ["luxury", "fashion", "affluent", "premium", "high-end", "brand", "consumer", "luxury brand", "luxury consumer"],
    "Ecommerce_Retail_Tech": ["ecommerce", "e-commerce", "retail", "shopify", "online store", "checkout", "fulfillment", "retail tech", "retail technology", "omnichannel"],
    "AI_and_Strategy": ["ai", "artificial intelligence", "llm", "gpt", "openai", "benchmark", "model release", "mmlu", "anthropic", "claude", "machine learning"],
  };
  
  const keywords = categoryKeywords[category] || [];
  let matches = 0;
  for (const kw of keywords) {
    // Use word boundary for short keywords, substring for longer ones
    if (kw.length <= 3) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(titleAndSource)) {
        matches++;
      }
    } else {
      if (titleAndSource.includes(kw.toLowerCase())) {
        matches++;
      }
    }
  }
  return matches;
}

