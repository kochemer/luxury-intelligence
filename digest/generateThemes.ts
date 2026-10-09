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
import { getTopicDisplayName } from '../lib/utils/topicNames';

import { readJsonCache, writeJsonCache } from '../lib/utils/cachePaths';
import { getModelFor, maxTokensParam, temperatureParam } from '../lib/llm/models';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const THEME_MODEL = process.env.THEME_MODEL || getModelFor('classify');
const TEMPERATURE = 0; // Deterministic
const MAX_TOKENS = 500;
const CACHE_KIND = 'themes';
const THEME_VERSION = '3.1'; // Incremented: insight framing (not summary)

// Summary generator/judge models
// The pull-quote is the most visible single line on the site, so its generator
// runs on the same tier as the judge (GPT-6.1 Sol since 2026-10-09). Was
// 'summarize' (gpt-4.1). Sol ignores the generator's 0.9 temperature and uses
// its default of 1, which still gives distinct candidates (checked on W39).
const SUMMARY_GENERATOR_MODEL = process.env.SUMMARY_GENERATOR_MODEL || getModelFor('polish');
const SUMMARY_JUDGE_MODEL     = process.env.SUMMARY_JUDGE_MODEL     || getModelFor('polish');

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
  summaryCandidates?: string[];
};

type CacheEntry = {
  keyThemes: string[];
  oneSentenceSummary: string;
  summaryCandidates?: string[]; // All generated candidates before judge selection
  cached_at: string;
  model: string;
  version: string;
};

type ThemesCache = {
  [key: string]: CacheEntry;
};

// Cache management (uses unified cache paths)
async function loadCache(): Promise<ThemesCache> {
  const cache = await readJsonCache<ThemesCache>(CACHE_KIND);
  return cache || {};
}

async function saveCache(cache: ThemesCache): Promise<void> {
  try {
    await writeJsonCache(CACHE_KIND, cache);
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
 * Stage 1 — Generator: produce 4 structurally distinct insight candidates.
 * An insight is an interpretation or implication of the week's events — not
 * a report of what happened, but a non-obvious reading of what it means.
 */
async function generateSummaryCandidates(
  digest: WeeklyDigest,
  openai: OpenAI
): Promise<string[]> {
  const headlines = [
    ...digest.topics.AI_and_Strategy.top.slice(0, 4),
    ...digest.topics.Ecommerce_Retail_Tech.top.slice(0, 4),
    ...digest.topics.Luxury_and_Consumer.top.slice(0, 3),
    ...digest.topics.Jewellery_Industry.top.slice(0, 2),
  ]
    .map((a, i) => `${i + 1}. ${a.title} (${a.source})`)
    .join('\n');

  const prompt = `You are the editorial voice of a premium intelligence digest covering AI, ecommerce, luxury, and jewellery.

Selected article headlines for week ${digest.weekLabel}:
${headlines}

Write exactly 4 one-sentence INSIGHTS — not summaries of what happened, but interpretations of what it means. An insight is a non-obvious reading: an implication, a tension, a pattern, or a reframing that a smart reader would not have arrived at on their own.

Each candidate must use a DIFFERENT analytical lens:

Candidate 1 — Implication: What does the week's dominant story quietly signal for the next 6–12 months?
Candidate 2 — Paradox: What contradiction or irony do the week's events expose that nobody is saying plainly?
Candidate 3 — Reframe: What conventional wisdom or received narrative do these events undermine or complicate?
Candidate 4 — Pattern: What small but telling signal, visible across multiple articles, points to a larger structural shift?

Rules for all four:
- Maximum 25 words each
- Must be interpretive, not descriptive — avoid "X announced", "Y reported", "Z is growing"
- No two sentences may share the same opening word or grammatical structure
- No filler phrases ("this week", "in a world where", "it is clear", "as we see")
- Grounded in the specific articles above — no insight that could apply to any random week
- No bullet points, labels, or numbering in the output sentences themselves

Respond as JSON:
{
  "candidates": [
    "Candidate 1 insight here",
    "Candidate 2 insight here",
    "Candidate 3 insight here",
    "Candidate 4 insight here"
  ]
}`;

  const response = await openai.chat.completions.create({
    model: SUMMARY_GENERATOR_MODEL,
    ...temperatureParam(SUMMARY_GENERATOR_MODEL, 0.9),
    ...maxTokensParam(SUMMARY_GENERATOR_MODEL, 400),
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) return [];

  const parsed = JSON.parse(content);
  const candidates: string[] = Array.isArray(parsed.candidates)
    ? parsed.candidates
        .filter((c: unknown) => typeof c === 'string')
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 0)
    : [];

  console.log(`[Themes] Generated ${candidates.length} insight candidates`);
  candidates.forEach((c, i) => console.log(`  [${i + 1}] ${c}`));
  return candidates;
}

/**
 * Stage 2 — Judge: evaluate all candidates and select the best one.
 * Uses the polish model (most capable) at temperature 0 for deterministic choice.
 */
async function judgeAndSelectSummary(
  candidates: string[],
  digest: WeeklyDigest,
  openai: OpenAI
): Promise<string> {
  if (candidates.length === 0) return '';
  if (candidates.length === 1) return candidates[0];

  const headlines = [
    ...digest.topics.AI_and_Strategy.top.slice(0, 3),
    ...digest.topics.Ecommerce_Retail_Tech.top.slice(0, 3),
    ...digest.topics.Luxury_and_Consumer.top.slice(0, 2),
    ...digest.topics.Jewellery_Industry.top.slice(0, 2),
  ]
    .map((a) => `- ${a.title}`)
    .join('\n');

  const numberedCandidates = candidates
    .map((c, i) => `${i + 1}. "${c}"`)
    .join('\n');

  const prompt = `You are the editorial director of a premium intelligence digest. Select the single best insight from the four candidates below.

An insight is NOT a summary of events. It is a non-obvious interpretation — an implication, paradox, reframe, or pattern that reveals something a smart reader would not have thought of alone.

This week's key article headlines (for context):
${headlines}

Candidates:
${numberedCandidates}

Evaluate each on three criteria:
1. Depth — does it reveal something non-obvious, or just restate what happened?
2. Provocation — would it make an informed reader stop, reconsider, or want to argue with it?
3. Specificity — is it anchored in this week's actual events, or could it apply to any week?

Reject any candidate that is primarily descriptive ("X announced Y"). Prefer the candidate that feels like the sharpest analytical observation a senior editor would pull out of the week's material.

Ties should be broken in favour of depth.

Respond as JSON:
{
  "winner": <number 1-${candidates.length}>,
  "sentence": "<the exact winning sentence>"
}`;

  const response = await openai.chat.completions.create({
    model: SUMMARY_JUDGE_MODEL,
    ...temperatureParam(SUMMARY_JUDGE_MODEL, 0),
    ...maxTokensParam(SUMMARY_JUDGE_MODEL, 150),
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) return candidates[0];

  const parsed = JSON.parse(content);
  const winner = typeof parsed.winner === 'number' ? parsed.winner : 1;
  const sentence = typeof parsed.sentence === 'string' ? parsed.sentence.trim() : '';

  console.log(`[Themes] Judge selected candidate ${winner}: "${sentence}"`);
  return sentence || candidates[0];
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
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // ── Stage A: key themes (unchanged single-call logic) ─────────────────
    const prompt = buildThemePrompt(digest, isRetry);
    const response = await openai.chat.completions.create({
      model: THEME_MODEL,
      ...temperatureParam(THEME_MODEL, TEMPERATURE),
      ...maxTokensParam(THEME_MODEL, MAX_TOKENS),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content);

    let keyThemes = Array.isArray(parsed.keyThemes)
      ? parsed.keyThemes
          .filter((t: any) => typeof t === 'string')
          .map((t: string) => t.trim().replace(/[.,;:!?]/g, ''))
          .filter((t: string) => t.length > 0)
          .slice(0, 5)
      : [];

    // Validate themes, retry once with stricter prompt if needed
    const validation = validateThemes(keyThemes);
    if (!validation.isValid && !isRetry) {
      console.warn(`[Themes] Validation failed: ${validation.issues.join('; ')}. Retrying with stricter prompt...`);
      const retryResult = await callLLMForThemes(digest, true);
      if (retryResult) {
        const retryValidation = validateThemes(retryResult.keyThemes);
        if (retryValidation.isValid) return retryResult;
        console.warn(`[Themes] Retry still has issues: ${retryValidation.issues.join('; ')}. Using original output.`);
      }
    } else if (!validation.isValid && isRetry) {
      console.warn(`[Themes] Retry output has validation issues: ${validation.issues.join('; ')}. Using output anyway.`);
    }

    const validatedThemes = keyThemes.map((theme: string) => {
      const words = theme.split(/\s+/).filter((w: string) => w.length > 0);
      if (words.length > 6) {
        console.warn(`[Themes] Theme exceeds 6 words: "${theme}", truncating`);
        return words.slice(0, 6).join(' ');
      }
      return theme;
    }).filter((theme: string) => theme.split(/\s+/).length >= 2);

    // ── Stage B: two-stage summary (generator → judge) ────────────────────
    console.log(`[Themes] Generating insight candidates (generator model: ${SUMMARY_GENERATOR_MODEL})...`);
    const summaryCandidates = await generateSummaryCandidates(digest, openai);

    let oneSentenceSummary = '';
    if (summaryCandidates.length > 0) {
      console.log(`[Themes] Running editorial judge (judge model: ${SUMMARY_JUDGE_MODEL})...`);
      oneSentenceSummary = await judgeAndSelectSummary(summaryCandidates, digest, openai);
    }

    // Fallback: if two-stage failed, use summary from themes call
    if (!oneSentenceSummary) {
      oneSentenceSummary = typeof parsed.oneSentenceSummary === 'string'
        ? parsed.oneSentenceSummary.trim()
        : '';
      if (oneSentenceSummary) {
        console.warn('[Themes] Two-stage insight generation failed, falling back to single-call summary');
      }
    }

    return {
      keyThemes: validatedThemes,
      oneSentenceSummary,
      summaryCandidates,
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

  // Save to cache (include all candidates for audit trail)
  cache[cacheKey] = {
    keyThemes: result.keyThemes,
    oneSentenceSummary: result.oneSentenceSummary,
    summaryCandidates: result.summaryCandidates,
    cached_at: new Date().toISOString(),
    model: THEME_MODEL,
    version: THEME_VERSION,
  };
  await saveCache(cache);

  console.log(`[Themes] Generated ${result.keyThemes.length} themes for ${digest.weekLabel}`);
  console.log(`[Themes] Final summary: "${result.oneSentenceSummary}"`);
  return result;
}

