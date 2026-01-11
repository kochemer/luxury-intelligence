/**
 * LLM-based article reranking for weekly digest Top 7 selection.
 * 
 * Replaces deterministic selection with LLM-based selection that considers:
 * - Relevance to category
 * - Diversity of sources
 * - Quality and newsworthiness
 * - Recency
 * 
 * Features:
 * - Deterministic (temperature 0)
 * - Cached by weekLabel + category + candidate hash
 * - Bounded cost (only sends title, source, date, snippet, score)
 * - Failure-safe (falls back to deterministic top 7)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import OpenAI from 'openai';
import type { Topic } from '../classification/classifyTopics';
import type { Article as BaseArticle } from '../classification/classifyTopics';

// Extended Article type that includes snippet (used in actual data)
type Article = BaseArticle & {
  snippet?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const RERANK_MODEL = process.env.RERANK_MODEL || 'gpt-4o-mini';
const TEMPERATURE = 0; // Deterministic
const MAX_TOKENS = 2000;
const CACHE_FILE = path.join(__dirname, '../data/rerank_cache.json');
const CANDIDATE_DEFAULT = 100; // Default candidate pool size
const CANDIDATE_MIN = 25;
const CANDIDATE_MAX = 100;
const SNIPPET_MAX_LENGTH = 350; // Truncate snippets to bound cost

// Types
type CandidateArticle = {
  id: string; // index in candidate array (0-based)
  title: string;
  source: string;
  date: string;
  snippet?: string;
  url: string; // for deduplication check
  flags?: {
    sponsored?: boolean;
    pressRelease?: boolean;
    controversialSuspected?: boolean;
  };
  tier?: "high" | "med" | "low"; // Optional category-match tier (not for ranking)
};

type RerankResult = {
  id: string;
  rank: number;
  why: string;
  confidence: number;
};

type RerankResponse = {
  selected: RerankResult[];
};

type CacheEntry = {
  selected: RerankResult[];
  cached_at: string;
  model: string;
};

type RerankCache = {
  [key: string]: CacheEntry;
};

type CategoryRerankStats = {
  category: string;
  total_available: number;
  candidates_count: number;
  selected_count: number;
  cache_hit: boolean;
  skipped: boolean;
  skip_reason?: string;
};

type RerankStats = {
  calls: number;
  cache_hits: number;
  cache_misses: number;
  fallbacks: number;
  total_candidates: number;
  category_stats: CategoryRerankStats[];
};

let stats: RerankStats = {
  calls: 0,
  cache_hits: 0,
  cache_misses: 0,
  fallbacks: 0,
  total_candidates: 0,
  category_stats: [],
};

export function getRerankStats(): RerankStats {
  return { ...stats };
}

export function resetRerankStats(): void {
  stats = {
    calls: 0,
    cache_hits: 0,
    cache_misses: 0,
    fallbacks: 0,
    total_candidates: 0,
    category_stats: [],
  };
}

// Cache management
async function loadCache(): Promise<RerankCache> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    console.warn(`[Reranker] Failed to load cache: ${err.message}`);
    return {};
  }
}

async function saveCache(cache: RerankCache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`[Reranker] Failed to save cache: ${err.message}`);
  }
}

/**
 * Create a deterministic fingerprint of candidates for cache key.
 * Sorts by URL first to ensure deterministic ordering.
 */
function fingerprintCandidates(candidates: CandidateArticle[]): string {
  // Sort candidates deterministically by URL (stable field)
  const sorted = [...candidates].sort((a, b) => a.url.localeCompare(b.url));
  
  // Extract stable fields for fingerprinting
  const candidateData = sorted.map(c => ({
    url: c.url, // required - primary identifier
    title: c.title || '', // optional but stable
    date: c.date || '', // optional but stable
    snippet: truncateSnippet(c.snippet, SNIPPET_MAX_LENGTH) || '', // optional, truncated consistently
  }));
  
  // Create hash from stable fields
  const hash = crypto.createHash('md5')
    .update(JSON.stringify(candidateData))
    .digest('hex')
    .slice(0, 12);
  
  return hash;
}

function getCacheKey(weekLabel: string, category: Topic, candidates: CandidateArticle[]): string {
  const fingerprint = fingerprintCandidates(candidates);
  return `${weekLabel}:${category}:${fingerprint}`;
}

function truncateSnippet(snippet: string | undefined, maxLength: number): string {
  if (!snippet) return '';
  if (snippet.length <= maxLength) return snippet;
  return snippet.substring(0, maxLength - 3) + '...';
}

function buildRerankPrompt(
  category: Topic,
  categoryDisplayName: string,
  candidates: CandidateArticle[]
): string {
  const candidateList = candidates.map((c, idx) => {
    const snippet = truncateSnippet(c.snippet, SNIPPET_MAX_LENGTH);
    const flags: string[] = [];
    if (c.flags?.sponsored || c.flags?.pressRelease) flags.push('[SPONSORED/PRESS RELEASE]');
    if (c.flags?.controversialSuspected) flags.push('[CONTROVERSY FLAGGED - REVIEW]');
    const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
    const tierStr = c.tier ? ` [Tier: ${c.tier}]` : '';
    
    return `${idx}. ${c.title}${flagStr}${tierStr}
   Source: ${c.source}
   Date: ${c.date}
   ${snippet ? `Snippet: ${snippet}` : ''}
   URL: ${c.url}`;
  }).join('\n\n');

  const targetCount = Math.min(7, candidates.length);
  const isSmallCategory = candidates.length >= 2 && candidates.length < 7;
  
  return `You are selecting articles for a weekly brief in the "${categoryDisplayName}" category.

Your goal is to select and rank the ${targetCount} article${targetCount > 1 ? 's' : ''} for Pandora colleagues interested in retail/ecommerce intelligence.

${isSmallCategory 
  ? `IMPORTANT: This category has only ${candidates.length} candidate${candidates.length > 1 ? 's' : ''}. You MUST select ALL ${candidates.length} of them, ordered by importance (ranks 1-${candidates.length}).`
  : `Select the top ${targetCount} articles from the candidates below, ordered by importance (ranks 1-${targetCount}).`}

SELECTION CRITERIA (priority order):

A) RELEVANCE TO PANDORA COLLEAGUES (highest priority)
   Prioritize articles with practical implications for retail/ecommerce:
   - Customer experience (CX), conversion optimization
   - CRM/loyalty programs, customer retention
   - Merchandising, product assortment, inventory
   - Pricing/promotions, margin management
   - Supply chain, logistics, fulfillment
   - Store operations and digital commerce integration
   - Analytics, experimentation, measurement
   - AI productivity tools and governance

B) RELEVANCE TO RETAIL/FASHION ECOMMERCE LANDSCAPE
   - Must connect to commerce; deprioritize generic tech unless clearly applied to retail
   - Focus on actionable insights for retail professionals

C) INSIGHTFULNESS
   Prefer articles with:
   - New data, benchmarks, metrics
   - Case studies with measurable outcomes
   - Strong analysis and non-obvious takeaways
   - Concrete examples and real-world applications
   Avoid:
   - Thin rewrites or summaries
   - Pure announcements without analysis
   - Vendor marketing without substance
   - Generic thought leadership

D) CONTROVERSY FILTER (hard constraint - EXCLUDE these)
   Do NOT select articles primarily about:
   - War/armed conflict/violence (unless directly about retail supply chain impact)
   - Culture-war/polarizing identity politics
   - Election horse-race politics
   EXCEPTION: Allow policy/regulation with DIRECT retail/ecommerce/AI impact:
   - Tariffs, trade policy affecting retail pricing/supply chain
   - AI compliance laws (AI Act, GDPR, privacy regulation)
   - Platform regulation with direct commerce impact
   - Consumer protection laws affecting retail
   Articles marked [CONTROVERSY FLAGGED - REVIEW] should be carefully evaluated against this filter.

E) RECENCY
   - All articles are from the same week; treat Monday and Friday equally
   - No intra-week recency bias - all in-week articles are equally recent

CONSTRAINTS:
- Select exactly ${targetCount} article${targetCount > 1 ? 's' : ''} (or fewer if fewer eligible candidates)
- Max 2 articles per source (enforce source diversity)
- Avoid duplicates/near-duplicates of the same story/topic
- Never select duplicates (check URLs if provided)

Candidate articles (all eligible - no numeric scores provided):
${candidateList}

Return a JSON object with this exact structure:
{
  "selected": [
    { "id": "0", "rank": 1, "why": "brief concrete reason (5-15 words)", "confidence": 0.9 },
    { "id": "1", "rank": 2, "why": "brief concrete reason (5-15 words)", "confidence": 0.85 },
    ...
  ]
}

Rules:
- "id" must match the candidate number (0, 1, 2, ...)
- "rank" must be 1-N, unique, sequential (where N = number of candidates to select)
- "why" should be a short phrase (5-15 words) explaining why this article was selected - be concrete and specific
- "confidence" should be 0.0-1.0
- CRITICAL: Selection count must match exactly:
  - You must return exactly ${targetCount} item${targetCount > 1 ? 's' : ''} in the "selected" array
${isSmallCategory ? `- For this small category with ${candidates.length} candidates, select ALL ${candidates.length} candidates (ids 0-${candidates.length - 1})` : ''}
  - Never select fewer than ${targetCount}
  - Never select more than 7 total

Respond with ONLY valid JSON, no markdown, no code blocks, just raw JSON.`;
}

async function callRerankLLM(
  category: Topic,
  categoryDisplayName: string,
  candidates: CandidateArticle[]
): Promise<RerankResponse | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[Reranker] OPENAI_API_KEY not found, skipping LLM rerank`);
    return null;
  }

  const prompt = buildRerankPrompt(category, categoryDisplayName, candidates);

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: RERANK_MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content: 'You are a precise article selector. Always respond with valid JSON only, no markdown formatting, no code blocks, just raw JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      ...(RERANK_MODEL.includes('gpt-4') || RERANK_MODEL.includes('1106') || RERANK_MODEL.includes('o-mini')
        ? { response_format: { type: 'json_object' } }
        : {}),
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      console.warn(`[Reranker] Empty response from LLM`);
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
    if (!parsed.selected || !Array.isArray(parsed.selected)) {
      console.warn(`[Reranker] Invalid response: missing or invalid "selected" array`);
      return null;
    }

    return parsed as RerankResponse;
  } catch (err: any) {
    console.warn(`[Reranker] LLM API error: ${err.message}`);
    return null;
  }
}

function validateRerankResponse(
  response: RerankResponse,
  candidates: CandidateArticle[]
): { valid: boolean; error?: string } {
  const selected = response.selected;
  if (!selected || !Array.isArray(selected)) {
    return { valid: false, error: 'Missing or invalid selected array' };
  }

  // Check for exactly 7 items (or fewer if fewer candidates)
  const expectedCount = Math.min(7, candidates.length);
  if (selected.length !== expectedCount) {
    return { valid: false, error: `Expected ${expectedCount} items, got ${selected.length}` };
  }

  // Validate IDs exist and are unique
  const ids = new Set<string>();
  const ranks = new Set<number>();
  const urls = new Set<string>();

  for (const item of selected) {
    // Check ID exists
    const idNum = parseInt(item.id, 10);
    if (isNaN(idNum) || idNum < 0 || idNum >= candidates.length) {
      return { valid: false, error: `Invalid id: ${item.id}` };
    }

    // Check rank is valid
    if (item.rank < 1 || item.rank > 7) {
      return { valid: false, error: `Invalid rank: ${item.rank}` };
    }

    // Check for duplicates
    if (ids.has(item.id)) {
      return { valid: false, error: `Duplicate id: ${item.id}` };
    }
    if (ranks.has(item.rank)) {
      return { valid: false, error: `Duplicate rank: ${item.rank}` };
    }

    // Check for duplicate URLs
    const candidate = candidates[idNum];
    if (urls.has(candidate.url)) {
      return { valid: false, error: `Duplicate URL: ${candidate.url}` };
    }

    ids.add(item.id);
    ranks.add(item.rank);
    urls.add(candidate.url);
  }

  // Check ranks are sequential 1..N
  const sortedRanks = [...ranks].sort((a, b) => a - b);
  for (let i = 0; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== i + 1) {
      return { valid: false, error: `Ranks not sequential: ${sortedRanks.join(', ')}` };
    }
  }

  return { valid: true };
}

function getCategoryDisplayName(category: Topic): string {
  const names: Record<Topic, string> = {
    'AI_and_Strategy': 'AI & Strategy',
    'Ecommerce_Retail_Tech': 'Ecommerce & Retail Tech',
    'Luxury_and_Consumer': 'Luxury & Consumer',
    'Jewellery_Industry': 'Jewellery Industry',
  };
  return names[category];
}

/**
 * Rerank articles using LLM with caching and fallback.
 * 
 * @param weekLabel - Week label (e.g., "2026-W01")
 * @param category - Topic category
 * @param totalAvailable - Total articles available in category (for logging)
 * @param candidates - Candidate articles with deterministic scores
 * @param fallbackSelect - Fallback function to use if LLM fails
 * @returns Selected articles in reranked order
 */
export async function rerankArticles<T extends Article & { snippet?: string }>(
  weekLabel: string,
  category: Topic,
  totalAvailable: number,
  candidates: T[],
  fallbackSelect: (articles: T[]) => T[]
): Promise<{
  selected: T[];
  explainability?: Array<{ rerankWhy?: string; rerankConfidence?: number }>;
  fromCache: boolean;
  fromFallback: boolean;
}> {
  const categoryKey = category;
  let categoryStat: CategoryRerankStats = {
    category: categoryKey,
    total_available: totalAvailable,
    candidates_count: candidates.length,
    selected_count: 0,
    cache_hit: false,
    skipped: false,
  };

  // If no candidates, skip
  if (candidates.length === 0) {
    categoryStat.skipped = true;
    categoryStat.skip_reason = 'no candidates';
    stats.category_stats.push(categoryStat);
    return {
      selected: [],
      fromCache: false,
      fromFallback: true,
    };
  }

  // If single candidate, skip (no meaningful rerank)
  if (candidates.length === 1) {
    const selected = fallbackSelect(candidates);
    categoryStat.selected_count = selected.length;
    categoryStat.skipped = true;
    categoryStat.skip_reason = 'single candidate';
    stats.category_stats.push(categoryStat);
    return {
      selected,
      fromCache: false,
      fromFallback: true,
    };
  }

  // For 2-6 candidates, allow reranking (will return all candidates, max 7)
  // For 7+ candidates, rerank and return top 7

  // Build candidate list with bounded fields (no scores, just flags and metadata)
  const candidateList: CandidateArticle[] = candidates.map((article, idx) => {
    const gate = (article as any).gate;
    return {
      id: idx.toString(),
      title: article.title,
      source: article.source,
      date: article.published_at ? new Date(article.published_at).toLocaleDateString() : '',
      snippet: article.snippet,
      url: article.url,
      flags: gate?.flags ? {
        sponsored: gate.flags.sponsored,
        pressRelease: gate.flags.pressRelease,
        controversialSuspected: gate.flags.controversialSuspected,
      } : undefined,
      tier: gate?.tier,
    };
  });

  stats.total_candidates += candidateList.length;

  // Check cache
  const cacheKey = getCacheKey(weekLabel, category, candidateList);
  const fingerprint = fingerprintCandidates(candidateList);
  const cache = await loadCache();
  const cached = cache[cacheKey];
  
  // Debug logging
  const DEBUG = process.env.RERANK_DEBUG === 'true';
  if (DEBUG) {
    console.log(`[Reranker Debug] ${category}: fingerprint=${fingerprint.slice(0, 8)}, cacheKey=${cacheKey.slice(0, 50)}... ${cached ? 'HIT' : 'MISS'}`);
  }

  if (cached && cached.model === RERANK_MODEL) {
    stats.cache_hits++;
    categoryStat.cache_hit = true;
    // Map cached results back to articles
    const selected = cached.selected
      .sort((a, b) => a.rank - b.rank)
      .map(item => {
        const idx = parseInt(item.id, 10);
        return candidates[idx];
      })
      .filter(Boolean) as T[];

    const explainability = cached.selected
      .sort((a, b) => a.rank - b.rank)
      .map(item => ({
        rerankWhy: item.why,
        rerankConfidence: item.confidence,
      }));

    categoryStat.selected_count = selected.length;
    stats.category_stats.push(categoryStat);

    return {
      selected,
      explainability,
      fromCache: true,
      fromFallback: false,
    };
  }

  stats.cache_misses++;
  stats.calls++;

  // Call LLM
  const categoryDisplayName = getCategoryDisplayName(category);
  const llmResponse = await callRerankLLM(category, categoryDisplayName, candidateList);

  if (!llmResponse) {
    console.warn(`[Reranker] LLM call failed for ${weekLabel}/${category}, using fallback`);
    stats.fallbacks++;
    const selected = fallbackSelect(candidates);
    categoryStat.selected_count = selected.length;
    categoryStat.skip_reason = 'LLM call failed';
    stats.category_stats.push(categoryStat);
    return {
      selected,
      fromCache: false,
      fromFallback: true,
    };
  }

  // Validate response
  const validation = validateRerankResponse(llmResponse, candidateList);
  if (!validation.valid) {
    console.warn(`[Reranker] Invalid LLM response for ${weekLabel}/${category}: ${validation.error}, using fallback`);
    stats.fallbacks++;
    const selected = fallbackSelect(candidates);
    categoryStat.selected_count = selected.length;
    categoryStat.skip_reason = `Invalid response: ${validation.error}`;
    stats.category_stats.push(categoryStat);
    return {
      selected,
      fromCache: false,
      fromFallback: true,
    };
  }

  // Map results back to articles
  const selected = llmResponse.selected
    .sort((a, b) => a.rank - b.rank)
    .map(item => {
      const idx = parseInt(item.id, 10);
      return candidates[idx];
    })
    .filter(Boolean) as T[];

  const explainability = llmResponse.selected
    .sort((a, b) => a.rank - b.rank)
    .map(item => ({
      rerankWhy: item.why,
      rerankConfidence: item.confidence,
    }));

  // Save to cache
  cache[cacheKey] = {
    selected: llmResponse.selected,
    cached_at: new Date().toISOString(),
    model: RERANK_MODEL,
  };
  await saveCache(cache);

  categoryStat.selected_count = selected.length;
  stats.category_stats.push(categoryStat);

  return {
    selected,
    explainability,
    fromCache: false,
    fromFallback: false,
  };
}

