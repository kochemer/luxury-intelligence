/**
 * Generate key themes and one-sentence summary for a weekly digest.
 * Uses LLM with caching based on weekLabel + hash of selected article URLs.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import OpenAI from 'openai';
import type { WeeklyDigest } from './buildWeeklyDigest';
import { getTopicDisplayName } from '../utils/topicNames';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const THEME_MODEL = process.env.THEME_MODEL || 'gpt-4o-mini';
const TEMPERATURE = 0; // Deterministic
const MAX_TOKENS = 500;
const CACHE_FILE = path.join(__dirname, '../data/themes_cache.json');
const THEME_VERSION = '2.1'; // Increment to invalidate cache

// Banned phrases that indicate generic/vague themes
const BANNED_PHRASES = [
  'various industries',
  'emerging trends',
  'shifts and challenges',
  'economic pressures',
  'consumer behavior',
  'market dynamics',
  'ai\'s impact on',
  'trends in',
  'impact on',
  'challenges',
  'headwinds',
  'industry trends',
  'market trends',
  'retail challenges',
  'luxury challenges',
  'jewellery challenges',
  'ecommerce challenges',
];

// Types
type ThemeResult = {
  keyThemes: string[];
  oneSentenceSummary: string;
};

type CacheEntry = {
  keyThemes: string[];
  oneSentenceSummary: string;
  cached_at: string;
  model: string;
  version: string;
};

type ThemesCache = {
  [key: string]: CacheEntry;
};

// Cache management
async function loadCache(): Promise<ThemesCache> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    console.warn(`[Themes] Failed to load cache: ${err.message}`);
    return {};
  }
}

async function saveCache(cache: ThemesCache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`[Themes] Failed to save cache: ${err.message}`);
  }
}

/**
 * Create a deterministic fingerprint of selected articles for cache key.
 * Uses URLs of all selected articles across all categories.
 */
function fingerprintSelectedArticles(digest: WeeklyDigest): string {
  // Collect all selected article URLs from all topics
  const urls: string[] = [];
  
  for (const topicKey of ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'] as const) {
    const topic = digest.topics[topicKey];
    if (topic && topic.top) {
      for (const article of topic.top) {
        if (article.url) {
          urls.push(article.url);
        }
      }
    }
  }
  
  // Sort URLs deterministically
  const sortedUrls = [...urls].sort();
  
  // Create hash
  const hash = crypto.createHash('md5')
    .update(JSON.stringify(sortedUrls))
    .digest('hex')
    .slice(0, 12);
  
  return hash;
}

function getCacheKey(weekLabel: string, digest: WeeklyDigest): string {
  const fingerprint = fingerprintSelectedArticles(digest);
  return `${weekLabel}:${fingerprint}`;
}

/**
 * Build prompt for theme generation
 */
function buildThemePrompt(digest: WeeklyDigest, isRetry: boolean = false): string {
  const categories = [
    {
      name: getTopicDisplayName('AI_and_Strategy'),
      articles: digest.topics.AI_and_Strategy.top.map(a => ({
        title: a.title,
        source: a.source,
        snippet: a.snippet ? a.snippet.substring(0, 200) : undefined,
      })),
    },
    {
      name: getTopicDisplayName('Ecommerce_Retail_Tech'),
      articles: digest.topics.Ecommerce_Retail_Tech.top.map(a => ({
        title: a.title,
        source: a.source,
        snippet: a.snippet ? a.snippet.substring(0, 200) : undefined,
      })),
    },
    {
      name: getTopicDisplayName('Luxury_and_Consumer'),
      articles: digest.topics.Luxury_and_Consumer.top.map(a => ({
        title: a.title,
        source: a.source,
        snippet: a.snippet ? a.snippet.substring(0, 200) : undefined,
      })),
    },
    {
      name: getTopicDisplayName('Jewellery_Industry'),
      articles: digest.topics.Jewellery_Industry.top.map(a => ({
        title: a.title,
        source: a.source,
        snippet: a.snippet ? a.snippet.substring(0, 200) : undefined,
      })),
    },
  ];

  const categoryText = categories.map(cat => {
    const articlesText = cat.articles.map((art, idx) => {
      const snippetText = art.snippet ? `\n   ${art.snippet}` : '';
      return `${idx + 1}. ${art.title} (${art.source})${snippetText}`;
    }).join('\n\n');
    return `## ${cat.name}\n\n${articlesText}`;
  }).join('\n\n');

  const retrySuffix = isRetry 
    ? '\n\nIMPORTANT: Your last output was too generic. Be specific and grounded in the article titles and snippets. Each theme must be either: (1) a named company/product/concept with proper capitalization, OR (2) a specific business condition like "margin compression" or "cost inflation". Ban generic bucket phrases like "challenges", "headwinds", "market dynamics", "industry trends".'
    : '';

  return `You are analyzing a weekly digest of curated articles across AI & strategy, ecommerce & retail tech, luxury & consumer, and jewellery industry news.

Based on the selected articles below, generate themes and a summary that are SPECIFIC and GROUNDED in the actual article titles and snippets provided.

CRITICAL REQUIREMENTS:

1. Key Themes (3-5 items):
   - Each theme must be 2-6 words (strict limit)
   - NO punctuation (no periods, commas, etc.)
   - Each theme MUST be either:
     a) A named company / product / concept (with proper capitalization), OR
     b) A specific business condition (e.g., "margin compression", "cost inflation", "sales growth", "profit squeeze", "supply chain disruption")
   - Examples of GOOD themes: "Cartier UK sales", "agentic commerce", "retail media networks", "GenAI copilots", "margin compression", "Pragnell record sales"
   - BANNED patterns (do NOT use):
     * Generic bucket phrases: "challenges", "headwinds", "market dynamics", "industry trends", "retail challenges", "luxury challenges"
     * Vague placeholders: "AI's impact on...", "trends in...", "shifts and challenges", "various industries", "economic pressures", "consumer behavior"
     * Themes ending in generic terms: "...challenges", "...headwinds", "...trends", "...dynamics"
   - Balance themes across categories: If articles span multiple categories (AI, ecommerce, luxury, jewellery), ensure themes reflect that diversity. Don't over-weight one category unless articles are heavily skewed.
   - Themes should be scannable, concrete, and immediately recognizable from the articles
   - Capitalize proper nouns consistently (company names, product names, concepts)

2. One-Sentence Summary (maximum 22 words):
   - Must mention at least 2 specific concepts from the themes
   - Must be grounded in the actual articles, not generic observations
   - Focus on concrete developments, not abstract trends

Format your response as JSON:
{
  "oneSentenceSummary": "Specific summary mentioning concrete concepts (max 22 words)",
  "keyThemes": [
    "Concrete theme 2-6 words",
    "Another specific theme",
    "Third grounded theme",
    "Fourth concrete theme",
    "Fifth specific theme"
  ]
}

Selected articles for week ${digest.weekLabel}:

${categoryText}${retrySuffix}`;
}

/**
 * Check if a theme contains banned phrases or exceeds word limit
 */
function hasBannedPhrase(theme: string): boolean {
  const lowerTheme = theme.toLowerCase();
  return BANNED_PHRASES.some(phrase => lowerTheme.includes(phrase));
}

/**
 * Check if a theme is a generic bucket phrase (standalone generic terms)
 */
function isGenericBucketPhrase(theme: string): boolean {
  const lowerTheme = theme.toLowerCase().trim();
  const genericBuckets = [
    'challenges',
    'headwinds',
    'trends',
    'dynamics',
    'pressures',
    'shifts',
    'changes',
    'developments',
  ];
  
  // Check if theme is just a generic bucket or ends with one
  const words = lowerTheme.split(/\s+/);
  const lastWord = words[words.length - 1];
  return genericBuckets.includes(lastWord) && words.length <= 3;
}

/**
 * Check if theme is specific enough (named entity or specific business condition)
 */
function isSpecificEnough(theme: string): boolean {
  const lowerTheme = theme.toLowerCase();
  const words = theme.split(/\s+/);
  
  // Check for proper nouns (capitalized words) - indicates named entities
  const hasProperNoun = words.some(word => /^[A-Z]/.test(word) && word.length > 1);
  
  // Check for specific business conditions (concrete terms)
  const specificConditions = [
    'margin compression',
    'cost inflation',
    'profit squeeze',
    'sales growth',
    'revenue decline',
    'market share',
    'supply chain',
    'price increase',
    'price decrease',
    'inventory',
    'fulfillment',
    'logistics',
    'warehouse',
    'distribution',
  ];
  
  const hasSpecificCondition = specificConditions.some(condition => 
    lowerTheme.includes(condition)
  );
  
  // Check for specific product/concept terms
  const specificConcepts = [
    'genai',
    'agentic',
    'copilot',
    'llm',
    'api',
    'sdk',
    'platform',
    'marketplace',
    'retail media',
    'advertising',
    'personalization',
  ];
  
  const hasSpecificConcept = specificConcepts.some(concept => 
    lowerTheme.includes(concept)
  );
  
  // Theme is specific if it has: proper noun, specific condition, or specific concept
  return hasProperNoun || hasSpecificCondition || hasSpecificConcept;
}

/**
 * Validate themes for quality
 */
function validateThemes(themes: string[]): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  for (const theme of themes) {
    const words = theme.split(/\s+/).filter(w => w.length > 0);
    
    // Check word count (2-6 words)
    if (words.length < 2) {
      issues.push(`Theme too short: "${theme}"`);
    }
    if (words.length > 6) {
      issues.push(`Theme exceeds 6 words: "${theme}"`);
    }
    
    // Check for banned phrases
    if (hasBannedPhrase(theme)) {
      issues.push(`Theme contains banned phrase: "${theme}"`);
    }
    
    // Check for generic bucket phrases
    if (isGenericBucketPhrase(theme)) {
      issues.push(`Theme is generic bucket phrase: "${theme}"`);
    }
    
    // Check if theme is specific enough
    if (!isSpecificEnough(theme)) {
      issues.push(`Theme not specific enough (needs named entity or business condition): "${theme}"`);
    }
    
    // Check for punctuation
    if (/[.,;:!?]/.test(theme)) {
      issues.push(`Theme contains punctuation: "${theme}"`);
    }
  }
  
  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Call LLM to generate themes
 */
async function callLLMForThemes(digest: WeeklyDigest, isRetry: boolean = false): Promise<ThemeResult | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    console.warn('[Themes] OPENAI_API_KEY not found, skipping theme generation');
    return null;
  }

  try {
    const prompt = buildThemePrompt(digest, isRetry);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    const response = await openai.chat.completions.create({
      model: THEME_MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return null;
    }

    // Parse JSON response
    const parsed = JSON.parse(content);
    
    // Validate and normalize
    let oneSentenceSummary = typeof parsed.oneSentenceSummary === 'string' 
      ? parsed.oneSentenceSummary.trim() 
      : '';
    
    let keyThemes = Array.isArray(parsed.keyThemes)
      ? parsed.keyThemes
          .filter((t: any) => typeof t === 'string')
          .map((t: string) => t.trim().replace(/[.,;:!?]/g, '')) // Remove punctuation
          .filter((t: string) => t.length > 0)
          .slice(0, 5) // Max 5 themes
      : [];

    // Validate word counts
    const summaryWords = oneSentenceSummary.split(/\s+/).length;
    if (summaryWords > 22) {
      console.warn(`[Themes] Summary exceeds 22 words (${summaryWords}), truncating`);
      const words = oneSentenceSummary.split(/\s+/).slice(0, 22);
      oneSentenceSummary = words.join(' ');
    }

    // Validate themes
    const validation = validateThemes(keyThemes);
    if (!validation.isValid) {
      // If this is not a retry, try once more with stricter prompt
      if (!isRetry) {
        console.warn(`[Themes] Validation failed: ${validation.issues.join('; ')}. Retrying with stricter prompt...`);
        const retryResult = await callLLMForThemes(digest, true);
        if (retryResult) {
          const retryValidation = validateThemes(retryResult.keyThemes);
          if (retryValidation.isValid) {
            return retryResult;
          } else {
            console.warn(`[Themes] Retry still has issues: ${retryValidation.issues.join('; ')}. Using original output.`);
          }
        }
      } else {
        console.warn(`[Themes] Retry output has validation issues: ${validation.issues.join('; ')}. Using output anyway.`);
      }
    }

    // Final validation: ensure themes are 2-6 words
    const validatedThemes = keyThemes.map((theme: string) => {
      const words = theme.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2) {
        // If too short, pad with context (shouldn't happen often)
        return theme;
      }
      if (words.length > 6) {
        console.warn(`[Themes] Theme exceeds 6 words: "${theme}", truncating`);
        return words.slice(0, 6).join(' ');
      }
      return theme;
    }).filter((theme: string) => theme.split(/\s+/).length >= 2); // Remove themes that are still too short

    return {
      keyThemes: validatedThemes,
      oneSentenceSummary,
    };
  } catch (err: any) {
    console.error(`[Themes] LLM call failed: ${err.message}`);
    return null;
  }
}

/**
 * Generate themes for a weekly digest with caching
 * @param digest - The weekly digest (must have topics.top populated)
 * @param regenThemes - If true, bypass cache and regenerate
 * @returns Theme result or null if generation fails
 */
export async function generateThemesForDigest(
  digest: WeeklyDigest,
  regenThemes: boolean = false
): Promise<ThemeResult | null> {
  const cache = await loadCache();
  const cacheKey = getCacheKey(digest.weekLabel, digest);

  // Check cache unless regeneration is requested
  if (!regenThemes) {
    const cached = cache[cacheKey];
    if (cached && cached.version === THEME_VERSION && cached.model === THEME_MODEL) {
      console.log(`[Themes] Cache hit for ${digest.weekLabel}`);
      return {
        keyThemes: cached.keyThemes,
        oneSentenceSummary: cached.oneSentenceSummary,
      };
    }
  }

  console.log(`[Themes] Generating themes for ${digest.weekLabel}...`);

  // Call LLM
  const result = await callLLMForThemes(digest);

  if (!result) {
    console.warn(`[Themes] Failed to generate themes for ${digest.weekLabel}`);
    return null;
  }

  // Save to cache
  cache[cacheKey] = {
    keyThemes: result.keyThemes,
    oneSentenceSummary: result.oneSentenceSummary,
    cached_at: new Date().toISOString(),
    model: THEME_MODEL,
    version: THEME_VERSION,
  };
  await saveCache(cache);

  console.log(`[Themes] Generated ${result.keyThemes.length} themes for ${digest.weekLabel}`);
  return result;
}

