/**
 * Generate intro paragraph for a weekly digest.
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
import { getModelFor, maxTokensParam, temperatureParam, getReasoningFor, reasoningParam } from '../lib/llm/models';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INTRO_MODEL = process.env.INTRO_MODEL || getModelFor('summarize');
const TEMPERATURE = 0; // Deterministic
const MAX_TOKENS = 250;
const CACHE_KIND = 'intro';
const INTRO_VERSION = '2.0'; // Increment to invalidate cache

// Types
type IntroResult = {
  introParagraph: string;
};

type CacheEntry = {
  introParagraph: string;
  cached_at: string;
  model: string;
  version: string;
};

type IntroCache = {
  [key: string]: CacheEntry;
};

// Cache management (uses unified cache paths)
async function loadCache(): Promise<IntroCache> {
  const cache = await readJsonCache<IntroCache>(CACHE_KIND);
  return cache || {};
}

async function saveCache(cache: IntroCache): Promise<void> {
  try {
    await writeJsonCache(CACHE_KIND, cache);
  } catch (err: any) {
    console.warn(`[Intro] Failed to save cache: ${err.message}`);
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
 * Build prompt for intro paragraph generation
 */
function buildIntroPrompt(digest: WeeklyDigest): string {
  // Collect top article titles from each topic to give the LLM real signal
  const topicKeys = ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'] as const;
  const articleLines: string[] = [];

  for (const key of topicKeys) {
    const topic = digest.topics[key];
    if (topic?.top) {
      for (const article of topic.top.slice(0, 3)) {
        if (article.title) {
          articleLines.push(`- ${article.title}`);
        }
      }
    }
  }

  const articleBlock = articleLines.join('\n');

  return `You are writing the opening paragraph for a weekly intelligence digest covering luxury, retail tech, and AI.

This week's headlines:
${articleBlock}

Write a 3-sentence intro paragraph using this exact structure:

Sentence 1 — BURIED LEAD: Pick the most surprising, counterintuitive, or underreported headline from the list above. State its key fact concisely and directly. Do NOT pick the most obvious or biggest story — pick the one that readers are least likely to expect.

Sentence 2 — CONTEXT BRIDGE: Name 2-3 of the other main stories as quick concrete facts. No commentary, just what happened — companies, numbers, actions.

Sentence 3 — TENSION: End with a one-line observation about what two opposing forces are at play this week (e.g. growth vs. risk, incumbents vs. challengers, acceleration vs. friction). Frame it as a contrast, not a conclusion.

Rules:
- Use short, punchy declarative sentences. No subordinate clauses.
- Name specific companies, products, or numbers — never say "major players" or "key developments"
- No hype words: "groundbreaking", "transformative", "revolutionary", "significant", "exciting"
- No meta-references: never say "this week", "this digest", "below", "above"
- Do not editorialize about importance — let the facts carry the weight

Format your response as JSON:
{
  "introParagraph": "Your 3-sentence paragraph here"
}`;
}

/**
 * Call LLM to generate intro paragraph
 */
async function callLLMForIntro(digest: WeeklyDigest): Promise<IntroResult | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    console.warn('[Intro] OPENAI_API_KEY not found, skipping intro generation');
    return null;
  }

  try {
    const prompt = buildIntroPrompt(digest);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    const response = await openai.chat.completions.create({
      model: INTRO_MODEL,
      ...temperatureParam(INTRO_MODEL, TEMPERATURE),
      ...reasoningParam(INTRO_MODEL, getReasoningFor('summarize')),
      ...maxTokensParam(INTRO_MODEL, MAX_TOKENS),
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
    let introParagraph = typeof parsed.introParagraph === 'string' 
      ? parsed.introParagraph.trim() 
      : '';

    // Validate sentence count (should be 2-3 sentences)
    const sentences = introParagraph.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
    if (sentences.length < 2) {
      console.warn(`[Intro] Paragraph has fewer than 2 sentences (${sentences.length}), may need adjustment`);
    }
    if (sentences.length > 3) {
      console.warn(`[Intro] Paragraph has more than 3 sentences (${sentences.length}), truncating`);
      // Keep first 3 sentences
      introParagraph = sentences.slice(0, 3).join('. ').trim();
      if (!introParagraph.endsWith('.') && !introParagraph.endsWith('!') && !introParagraph.endsWith('?')) {
        introParagraph += '.';
      }
    }

    return {
      introParagraph,
    };
  } catch (err: any) {
    console.error(`[Intro] LLM call failed: ${err.message}`);
    return null;
  }
}

/**
 * Generate intro paragraph for a weekly digest with caching
 * @param digest - The weekly digest (must have topics.top populated and preferably keyThemes/oneSentenceSummary)
 * @param regenIntro - If true, bypass cache and regenerate
 * @returns Intro result or null if generation fails
 */
export async function generateIntroForDigest(
  digest: WeeklyDigest,
  regenIntro: boolean = false
): Promise<IntroResult | null> {
  const cache = await loadCache();
  const cacheKey = getCacheKey(digest.weekLabel, digest);

  // Check cache unless regeneration is requested
  if (!regenIntro) {
    const cached = cache[cacheKey];
    if (cached && cached.version === INTRO_VERSION && cached.model === INTRO_MODEL) {
      console.log(`[Intro] Cache hit for ${digest.weekLabel}`);
      return {
        introParagraph: cached.introParagraph,
      };
    }
  }

  console.log(`[Intro] Generating intro paragraph for ${digest.weekLabel}...`);

  // Call LLM
  const result = await callLLMForIntro(digest);

  if (!result) {
    console.warn(`[Intro] Failed to generate intro paragraph for ${digest.weekLabel}`);
    return null;
  }

  // Save to cache
  cache[cacheKey] = {
    introParagraph: result.introParagraph,
    cached_at: new Date().toISOString(),
    model: INTRO_MODEL,
    version: INTRO_VERSION,
  };
  await saveCache(cache);

  console.log(`[Intro] Generated intro paragraph for ${digest.weekLabel}`);
  return result;
}

