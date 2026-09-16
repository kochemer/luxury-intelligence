/**
 * @module rerankArticles
 *
 * LLM-based article reranking for weekly digest Top-7 selection.
 *
 * ## Why LLM reranking?
 * Deterministic scoring (keyword frequency, recency, source tier) misses
 * editorial signals — a short but genuinely important story can be ranked
 * below a verbose but unremarkable one. The LLM evaluates each candidate
 * holistically: relevance to the category, source diversity, newsworthiness,
 * and recency.
 *
 * ## Candidate pool construction
 * Before calling the LLM each category's pool is trimmed to at most
 * `RERANK_MAX_ITEMS` (default 18) candidates to stay within the model's TPM
 * budget. Trimming is deterministic: articles are scored by
 * `scoreCandidateForTrimming` (retail relevance keywords + source quality +
 * recency proxy), then the top N by score are sent to the LLM. Commerce
 * Materiality scores (from `scoring/commerceMateriality.ts`) influence
 * trimming weights but are NOT forwarded to the LLM to keep prompts concise.
 *
 * ## Caching
 * Results are keyed by `weekLabel:topic:<md5(candidateFingerprint)>` and
 * persisted via `lib/utils/cachePaths.ts`. On re-runs within the same week the
 * LLM is not called again unless the candidate pool changes (content hash
 * mismatch). Override with `RERANK_MAX_ITEMS`, `RERANK_MAX_CHARS`, and
 * `RERANK_COOLDOWN_MS` env vars.
 *
 * ## Fallback
 * If the LLM call fails (quota, timeout, bad JSON) the module falls back to
 * the deterministic `scoreCandidateForTrimming` ordering — the digest still
 * publishes, just without LLM curation. Fallbacks are counted in `RerankStats`.
 *
 * ## Commerce Materiality weights
 * Three weight factors tune how much commerce materiality influences trimming:
 * - `COMMERCE_MATERIALITY_WEIGHT_ECOM` (default 1.5) — Ecommerce & Retail Tech.
 * - `COMMERCE_MATERIALITY_WEIGHT_EMAIL` (default 1.2) — articles likely to
 *   resonate in the email digest.
 * - `COMMERCE_MATERIALITY_WEIGHT_OTHER` (default 0.3) — other topics.
 * These are tuning levers, not hard filters. Adjust via env vars.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import OpenAI from 'openai';
import { getTopicDisplayName } from '../lib/utils/topicNames';
import { computeCommerceMateriality } from '../scoring/commerceMateriality';
import type { Article, Topic } from '../lib/types';

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
  commerceMaterialityScore?: number; // For scoring/trimming, not sent to LLM
  commerceMaterialitySignals?: string[]; // For scoring/trimming, not sent to LLM
};

import { readJsonCache, writeJsonCache } from '../lib/utils/cachePaths';
import { maxTokensParam, temperatureParam } from '../lib/llm/models';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---

/**
 * Primary reranking model. Defaults to gpt-4.1 (full): a measured A/B on the
 * harness (16 Sep 2026) showed the previous `getModelFor('rank')` = o4-mini
 * FAILED on 3 of 4 categories and fell back to gpt-4.1-mini, whereas gpt-4.1
 * succeeded on all four and made better picks (e.g. dropping filler for
 * substantive stories). The reranker runs only ~4×/week, so the full model's
 * cost is negligible. Override with RERANKER_MODEL_PRIMARY for A/B testing.
 */
const RERANK_MODEL_PRIMARY = process.env.RERANKER_MODEL_PRIMARY || process.env.RERANK_MODEL || 'gpt-4.1';
/** Fallback model used if the primary fails. Should be cheaper/faster. */
const RERANK_MODEL_FALLBACK = process.env.RERANKER_MODEL_FALLBACK || 'gpt-4.1-mini';
/** Temperature 0 ensures deterministic selection across identical inputs. */
const TEMPERATURE = 0;
const MAX_TOKENS = 2000;
const CACHE_KIND = 'rerank';
/** Default candidate pool size passed to `rerankByCategory` callers. */
const CANDIDATE_DEFAULT = 100;
const CANDIDATE_MIN = 25;
const CANDIDATE_MAX = 100;
/** Snippets are truncated before being sent to the LLM to bound input tokens. */
const SNIPPET_MAX_LENGTH = 350;

// TPM-safe limits — tune via env vars if you hit rate-limit errors
/** Maximum articles sent to the LLM per category per call (default 18). */
const RERANK_MAX_ITEMS = parseInt(process.env.RERANK_MAX_ITEMS || '18', 10);
/** Maximum total characters sent per LLM call (approx. token budget guard). */
const RERANK_MAX_CHARS = parseInt(process.env.RERANK_MAX_CHARS || '80000', 10);
/** Cooldown between sequential category LLM calls to avoid TPM exhaustion. */
const RERANK_COOLDOWN_MS = parseInt(process.env.RERANK_COOLDOWN_MS || '6500', 10);

// Helper: sleep function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Commerce Materiality weights used during deterministic pre-trimming.
// Higher weights surface more commerce-relevant articles to the LLM.
// These do NOT alter what the LLM sees — only which candidates reach it.
const COMMERCE_MATERIALITY_WEIGHT_ECOM  = parseFloat(process.env.COMMERCE_MATERIALITY_WEIGHT_ECOM  || '1.5');
const COMMERCE_MATERIALITY_WEIGHT_EMAIL = parseFloat(process.env.COMMERCE_MATERIALITY_WEIGHT_EMAIL || '1.2');
const COMMERCE_MATERIALITY_WEIGHT_OTHER = parseFloat(process.env.COMMERCE_MATERIALITY_WEIGHT_OTHER || '0.3');

// Types
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

/** Returns a shallow copy of current rerank stats (safe to mutate). */
export function getRerankStats(): RerankStats {
  return { ...stats };
}

/** Resets stats counters — call at the start of each pipeline run. */
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

// Cache management (uses unified cache paths)
async function loadCache(): Promise<RerankCache> {
  const cache = await readJsonCache<RerankCache>(CACHE_KIND);
  return cache || {};
}

async function saveCache(cache: RerankCache): Promise<void> {
  try {
    await writeJsonCache(CACHE_KIND, cache);
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
  // Include the primary model AND the candidate window in the key: the cached
  // selection is a property of both (a) the model that produced it and (b) how
  // many candidates it was shown. Swapping RERANK_MODEL_PRIMARY or
  // RERANK_MAX_ITEMS (e.g. an A/B) must not return the previous config's picks.
  return `${weekLabel}:${category}:${RERANK_MODEL_PRIMARY}:i${RERANK_MAX_ITEMS}:${fingerprint}`;
}

function truncateSnippet(snippet: string | undefined, maxLength: number): string {
  if (!snippet) return '';
  if (snippet.length <= maxLength) return snippet;
  return snippet.substring(0, maxLength - 3) + '...';
}

/**
 * Deterministic pre-trim score used to select which candidates reach the LLM.
 *
 * Scoring components (additive):
 * - **Retail keyword matches** (+10 per keyword) — 30+ commerce-relevant terms.
 * - **High-quality source bonus** (+5) — McKinsey, Bain, BCG, FT, Bloomberg, WSJ, Economist.
 * - **Recency** (small boost proportional to Unix timestamp) — since all
 *   articles are within the same week this has minimal impact relative to
 *   keyword matches.
 *
 * Commerce Materiality scores (when present) are added after this base score
 * using the per-category weight constants above.
 */
function scoreCandidateForTrimming(candidate: CandidateArticle): number {
  let score = 0;
  const text = `${candidate.title} ${candidate.snippet || ''}`.toLowerCase();
  
  // Retail relevance keywords
  const retailKeywords = [
    "retail", "ecommerce", "e-commerce", "shopping", "checkout", "cart", "payment", "merchant",
    "store", "brand", "customer", "commerce", "marketplace", "fulfillment", "logistics",
    "luxury", "fashion", "jewelry", "jewellery", "watch", "pricing", "conversion", "revenue",
    "platform", "shopify", "amazon", "walmart", "omnichannel", "supply chain"
  ];
  
  // Count retail keyword matches
  const retailMatches = retailKeywords.filter(kw => text.includes(kw)).length;
  score += retailMatches * 10;
  
  // Source priority (high-quality sources get boost)
  const highQualitySources = ["mckinsey", "bain", "bcg", "ft", "bloomberg", "wsj", "economist"];
  if (highQualitySources.some(src => candidate.source.toLowerCase().includes(src))) {
    score += 5;
  }
  
  // Recency (newer is better, but all are from same week so minimal impact)
  // Parse date and give slight boost to more recent
  try {
    const date = new Date(candidate.date);
    if (!isNaN(date.getTime())) {
      score += 1; // Minimal recency boost
    }
  } catch {
    // Ignore date parsing errors
  }
  
  return score;
}

/**
 * Trim candidates to fit within budget (max items and max chars)
 */
function trimCandidatesToBudget(candidates: CandidateArticle[]): {
  trimmed: CandidateArticle[];
  totalChars: number;
} {
  if (candidates.length <= RERANK_MAX_ITEMS) {
    // Check char budget
    let totalChars = 0;
    const trimmed: CandidateArticle[] = [];
    
    for (const candidate of candidates) {
      const candidateStr = `${candidate.id}|${candidate.title}|${candidate.source}|${candidate.date}|${candidate.url}|${candidate.snippet || ''}`;
      const candidateChars = candidateStr.length;
      
      if (totalChars + candidateChars <= RERANK_MAX_CHARS) {
        trimmed.push(candidate);
        totalChars += candidateChars;
      } else {
        break; // Can't fit more
      }
    }
    
    return { trimmed, totalChars };
  }
  
  // First, score and sort by score (highest first)
  const scored = candidates.map(c => ({
    candidate: c,
    score: scoreCandidateForTrimming(c)
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  // Take top RERANK_MAX_ITEMS
  const topItems = scored.slice(0, RERANK_MAX_ITEMS).map(s => s.candidate);
  
  // Then trim to char budget by dropping lowest-scored items
  let totalChars = 0;
  const trimmed: CandidateArticle[] = [];
  
  for (const candidate of topItems) {
    const candidateStr = `${candidate.id}|${candidate.title}|${candidate.source}|${candidate.date}|${candidate.url}|${candidate.snippet || ''}`;
    const candidateChars = candidateStr.length;
    
    if (totalChars + candidateChars <= RERANK_MAX_CHARS) {
      trimmed.push(candidate);
      totalChars += candidateChars;
    } else {
      break; // Can't fit more
    }
  }
  
  return { trimmed, totalChars };
}

/**
 * Build AI-first selection criteria for AI_and_Strategy category
 */
function buildAICategoryCriteria(): string {
  return `SELECTION CRITERIA (priority order):

AI-PURITY GUIDELINES (STRONGLY PREFERRED):
- STRONGLY PREFER articles where AI is the PRIMARY subject (capability, models, labs, training/inference economics, evaluations, governance impacting AI development).
- AVOID articles where AI is only incidental (e.g., commerce/retail/marketplace/checkout/logistics story that merely mentions "AI" in passing without substantive AI content).
- If an article is primarily about commerce, retail, marketplace, checkout, logistics, or generic tech with only a superficial AI mention, prioritize other candidates first.

PURITY TARGET (FLEXIBLE):
- TARGET: At least 5-6 of the 7 selected articles should be primarily AI-technology / AI-industry / AI-policy affecting AI development.
- The remaining 1-2 articles may be "applied AI" if they demonstrate substantive AI capability, major platform shifts, or meaningful AI integration (e.g., agentic workflows at scale, new model integration that changes platform capabilities, significant AI-powered features).
- If you cannot find 7 high-quality AI-focused articles, you may include 1-2 applied/commerce articles, but prioritize the most AI-substantive ones available.
- Only return fewer than 7 (down to 4) if the candidate pool genuinely lacks sufficient AI-relevant content.

PRIMARY PRIORITIES (in order):

1) AI INDUSTRY ECONOMICS AND POWER MOVES
   - Financial performance, pricing, unit economics (inference costs), compute constraints
   - Major partnerships, acquisitions, funding, leadership changes at key AI labs/platforms
   - Market dynamics affecting AI development and deployment

2) FRONTIER MODEL RELEASES AND CAPABILITY LEAPS
   - New major model launches, weights releases, product/model updates with meaningful capability changes
   - Evidence of improvements in reasoning, coding, math, agents, multimodality
   - Significant performance gains or new capabilities demonstrated

3) BENCHMARK / EVALUATION BREAKTHROUGHS
   - Strong results on credible benchmarks or new eval methods (e.g., SWE-bench, MMLU variants, GPQA, MATH, HumanEval, multimodal evals)
   - Prefer articles that cite concrete metrics or credible comparisons
   - New evaluation frameworks that advance the field

4) RESEARCH AND TECHNICAL PARADIGM SHIFTS
   - New methods (training, inference, architectures), scaling laws, efficiency breakthroughs
   - RAG/agents/tool-use advances with real novelty
   - Breakthroughs in safety/alignment/evals that change the field
   - Novel technical approaches with demonstrated impact

5) REGULATION/POLICY THAT MATERIALLY AFFECTS AI DEVELOPMENT
   - Compute export controls, model governance, AI safety regulation that constrains or enables frontier work
   - Policy changes that directly impact AI research, development, or deployment

SECONDARY PRIORITIES:
- Practical adoption stories only if they demonstrate a genuinely new capability (e.g., agentic workflows at scale)
- NOT generic "AI adoption" or "AI ethics" commentary

MINOR TIE-BREAKER (ONLY IF OTHERWISE EQUAL):
- Relevance to ecommerce/retail/luxury operators (Pandora lens) can break ties between equally important AI articles.
- This is a minor consideration - do NOT prioritize retail relevance over AI field importance.

EXCLUSIONS / DOWNRANK RULES:
Explicitly deprioritize (but do not automatically exclude):
- AI in retail/ecommerce operational pieces that are primarily about commerce operations (prioritize those with major model/platform capability shifts)
- Generic "AI adoption" surveys and workforce anxiety reports without technical or economic insights
- Generic "AI will change jobs" commentary without technical, economic, or policy substance
- Vendor webinars and PR launches without capability/economic substance
- Education/university pilot stories unless they demonstrate a notable new technique or significant scale
- Culture-war, outrage, "alarm/concern" stories unless there is a meaningful AI capability/policy angle
- Low-signal press releases without technical or economic substance
- Duplicates of the same announcement
- Articles marked [CONTROVERSY FLAGGED - REVIEW] should be carefully evaluated

Note: If the candidate pool is limited, you may include some of these if they are the best available options, but prioritize AI-substantive content.

RECENCY:
- All articles are from the same week; treat Monday and Friday equally
- No intra-week recency bias - all in-week articles are equally recent

IMPORTANT: When explaining your selection ("why" field), focus on AI-specific significance (capability shift, economics, evaluation, policy impact), not general tech interest or retail relevance.`;
}

/**
 * Build Ecommerce & Retail Tech selection criteria (industry-first, not Pandora-first)
 */
function buildEcommerceCategoryCriteria(): string {
  return `SELECTION CRITERIA (priority order):

PRIMARY PRIORITIES (in order):

1) INDUSTRY SIGNIFICANCE (primary)
   Prefer developments that materially affect ecommerce/retail tech landscape broadly:
   - Platforms: major platform changes, marketplace dynamics, new platform entrants
   - Payments: payment infrastructure, fraud prevention, checkout innovations
   - Marketplaces: marketplace economics, seller/buyer dynamics, platform policies
   - Retail media: advertising platforms, attribution, measurement
   - Logistics/fulfillment: shipping, warehousing, last-mile delivery innovations
   - Fraud/identity: authentication, fraud prevention, identity verification
   - Personalization: recommendation engines, customer segmentation, targeting
   - Regulation: policy changes with direct commerce impact (privacy, platform regulation, consumer protection)
   - Major product/strategy shifts by large players (Amazon, Shopify, Stripe, etc.)
   - Meaningful adoption: significant rollouts or industry-wide trends
   - Focus on developments that affect the broader industry, not just single companies

2) INSIGHTFULNESS / EVIDENCE (primary)
   Prefer articles with:
   - Data, benchmarks, quantified outcomes
   - Case studies with measurable results
   - Credible analysis and non-obvious insights
   - Concrete examples and real-world applications
   - Strong evidence-based reporting
   Avoid:
   - Thin rewrites or summaries
   - Pure announcements without analysis
   - Vendor marketing without substance
   - Generic thought leadership
   - PR releases without data or context

3) COMMERCE MATERIALITY (primary)
   Must connect to real commerce execution impact:
   - Operations: platform capabilities, checkout/cart changes, fulfillment improvements
   - Conversion: changes that affect conversion rates, cart abandonment, checkout flow
   - Monetization: revenue model changes, pricing strategies, commission structures
   - Cost: efficiency gains, cost reductions, margin improvements
   - Risk: fraud prevention, compliance, security
   - Deprioritize discourse-only content without deployment or execution impact
   - Low materiality (0-2/10) often indicates commentary without real-world deployment

SECONDARY PRIORITY (tie-breaker only):

4) PRACTICAL RELEVANCE TO YOUR ORG (secondary tie-breaker)
   Use Pandora/jewelry/luxury relevance ONLY as tie-breaker between similarly significant items:
   - Only consider when articles are otherwise equal in industry significance, insightfulness, and materiality
   - Do not over-index on jewellery/luxury-specific angles
   - Do not favor luxury/jewelry unless the story is objectively top-tier for ecommerce/retail tech
   - Practical implications for retail/ecommerce operations can break ties:
     * Customer experience (CX), conversion optimization
     * CRM/loyalty programs, customer retention
     * Merchandising, product assortment, inventory
     * Pricing/promotions, margin management
     * Supply chain, logistics, fulfillment
     * Store operations and digital commerce integration
     * Analytics, experimentation, measurement

5) RECENCY
   - All articles are from the same week; treat Monday and Friday equally
   - No intra-week recency bias - all in-week articles are equally recent

CONTROVERSY FILTER (hard constraint - EXCLUDE these):
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

IMPORTANT: Do not favor luxury/jewelry unless the story is objectively top-tier for ecommerce/retail tech.
Prioritize industry significance and insightfulness over narrow organizational relevance.
`;
}

/**
 * Build default selection criteria for non-AI categories (retail/ecommerce focus)
 */
function buildDefaultCategoryCriteria(category: Topic): string {
  return `SELECTION CRITERIA (priority order):

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
   - No intra-week recency bias - all in-week articles are equally recent`;
}

function buildRerankPrompt(
  category: Topic,
  categoryDisplayName: string,
  candidates: CandidateArticle[]
): string {
  // Build minimal payload: id, title, source, date, url, 1-sentence summary
  const candidateList = candidates.map((c, idx) => {
    // Create 1-sentence summary from snippet (truncate to ~100 chars for 1 sentence)
    let summary = '';
    if (c.snippet) {
      const truncated = truncateSnippet(c.snippet, 100);
      // Take first sentence or first 100 chars
      const firstSentence = truncated.split(/[.!?]/)[0];
      summary = firstSentence.length > 0 ? firstSentence.trim() : truncated.substring(0, 100).trim();
    }
    
    return `${idx}. ${c.title}
   Source: ${c.source}
   Date: ${c.date}
   ${summary ? `Summary: ${summary}` : ''}
   URL: ${c.url}`;
  }).join('\n\n');

  const targetCount = Math.min(7, candidates.length);
  const isSmallCategory = candidates.length >= 2 && candidates.length < 7;
  
  // Build category-specific selection criteria
  const selectionCriteria = category === 'AI_and_Strategy' 
    ? buildAICategoryCriteria()
    : category === 'Ecommerce_Retail_Tech'
    ? buildEcommerceCategoryCriteria()
    : buildDefaultCategoryCriteria(category);
  
  return `You are selecting articles for a weekly brief in the "${categoryDisplayName}" category.

${category === 'AI_and_Strategy' 
  ? `You are selecting for AI industry importance first; ignore retail relevance except as tie-breaker.

Your goal is to select and rank the ${targetCount} article${targetCount > 1 ? 's' : ''} that a serious AI practitioner/investor/research-following reader would consider most important this week.`
  : category === 'Ecommerce_Retail_Tech'
  ? `You are selecting for ecommerce/retail tech industry significance first; use Pandora relevance only as a tie-breaker.

Your goal is to select and rank the ${targetCount} article${targetCount > 1 ? 's' : ''} that represent the most important ecommerce/retail tech developments for the broader industry this week.`
  : `Your goal is to select and rank the ${targetCount} article${targetCount > 1 ? 's' : ''} for Pandora colleagues interested in retail/ecommerce intelligence.`}

${isSmallCategory 
  ? `IMPORTANT: This category has only ${candidates.length} candidate${candidates.length > 1 ? 's' : ''}. You MUST select ALL ${candidates.length} of them, ordered by importance (ranks 1-${candidates.length}).`
  : `Select the top ${targetCount} articles from the candidates below, ordered by importance (ranks 1-${targetCount}).`}

${selectionCriteria}

CRITICAL CONSTRAINTS (MUST BE ENFORCED IN YOUR SELECTION):

1) SOURCE DIVERSITY (HARD CONSTRAINT):
   - Maximum 3 articles from any single source in your top ${targetCount} selection
   - You MUST check the source of each article before selecting it
   - If you've already selected 3 articles from a source, DO NOT select any more from that source
   - This constraint is mandatory - your selection will be invalid if violated

${category === 'AI_and_Strategy' ? `2) ARXIV LIMIT FOR AI CATEGORY (HARD CONSTRAINT):
   - Maximum 1 article from ANY Arxiv source in your top ${targetCount} selection
   - Arxiv sources include: "arXiv - AI", "arXiv - Machine Learning", "arXiv - Computation and Language", "arXiv - Computer Vision", etc.
   - All Arxiv sources count as ONE group - you can only select 1 total Arxiv article
   - This constraint is mandatory - your selection will be invalid if violated
   - If you select multiple Arxiv articles, only the first one will be kept and others will be rejected

` : ''}3) SELECTION COUNT:
${category === 'AI_and_Strategy' 
  ? `   - PREFER selecting ${targetCount} articles, prioritizing AI-focused content
   - You MAY return fewer (down to 4) ONLY if the candidate pool genuinely lacks sufficient AI-relevant content
   - If needed, you may include 1-2 applied/commerce articles, but prioritize those with substantive AI content over those with only superficial AI mentions
   - Quality over quantity: better to return 5-6 high-quality AI articles than 7 with weak fillers, but try to reach ${targetCount} if possible`
  : `   - Select exactly ${targetCount} article${targetCount > 1 ? 's' : ''} (or fewer if fewer eligible candidates)`}

4) DUPLICATE PREVENTION:
   - Avoid duplicates/near-duplicates of the same story/topic
   - Never select duplicates (check URLs if provided)
   - Each article must be unique

IMPORTANT: Before finalizing your selection, verify:
- No more than 3 articles from any single source
${category === 'AI_and_Strategy' 
  ? `- No more than 1 article from any Arxiv source
- At least 5-6 of the selected articles are primarily AI-technology/AI-industry/AI-policy (target, but flexible)
- If fewer than ${targetCount} articles selected, it's because the candidate pool genuinely lacks sufficient AI-relevant content (minimum 4)`
  : ''}
- ${category === 'AI_and_Strategy' ? 'Between 4 and' : 'Exactly'} ${targetCount} unique articles selected

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
- "why" should be a short phrase (5-15 words) explaining why this article was selected - be concrete and specific${category === 'AI_and_Strategy' ? ' (focus on AI-specific significance: capability shift, economics, evaluation, or policy impact affecting AI development, NOT general tech interest or retail relevance)' : category === 'Ecommerce_Retail_Tech' ? ' (focus on industry significance and insightfulness, NOT narrow organizational relevance)' : ''}
- "confidence" should be 0.0-1.0
- CRITICAL: Selection count${category === 'AI_and_Strategy' ? ' (AI category allows 4-7)' : ' must match exactly'}:
${category === 'AI_and_Strategy'
  ? `  - You may return between 4 and ${targetCount} items in the "selected" array (prefer ${targetCount}, but allow fewer if candidate pool is weak)
  - Minimum 4 articles required (unless fewer than 4 candidates available)
  - Maximum 7 articles total`
  : `  - You must return exactly ${targetCount} item${targetCount > 1 ? 's' : ''} in the "selected" array
${isSmallCategory ? `  - For this small category with ${candidates.length} candidates, select ALL ${candidates.length} candidates (ids 0-${candidates.length - 1})` : ''}
  - Never select fewer than ${targetCount}
  - Never select more than 7 total`}

VALIDATION CHECKLIST (verify before submitting):
${category === 'AI_and_Strategy'
  ? `✓ Selected between 4 and ${targetCount} articles (fewer allowed only if candidate pool genuinely lacks AI-relevant content)
✓ At least 5-6 of selected articles are primarily AI-technology/AI-industry/AI-policy (target, flexible)
✓ Prioritized AI-substantive content over articles with only superficial AI mentions`
  : `✓ Selected exactly ${targetCount} articles`}
✓ No more than 3 articles from any single source
${category === 'AI_and_Strategy' ? '✓ No more than 1 article from any Arxiv source' : ''}
✓ All articles are unique (no duplicate URLs)
✓ All IDs are valid (0 to ${candidates.length - 1})
✓ Ranks are sequential (1, 2, 3, ...)

Respond with ONLY valid JSON, no markdown, no code blocks, just raw JSON.`;
}

/**
 * Check if error is RPD (requests per day) or TPM (tokens per minute) rate limit
 */
function isRPDorTPMError(err: any): boolean {
  const message = err.message || '';
  return message.includes('requests per day (RPD)') || message.includes('tokens per min (TPM)');
}

/**
 * Call OpenAI with retry logic for 429/transient errors
 * Returns response and whether to switch models (on RPD/TPM errors)
 */
async function callOpenAIWithRetry(
  openai: OpenAI,
  request: Parameters<typeof openai.chat.completions.create>[0],
  category: string,
  weekLabel: string,
  model: string,
  maxRetries: number = 8
): Promise<{ response: Awaited<ReturnType<typeof openai.chat.completions.create>>; shouldSwitchModel: boolean }> {
  let lastError: Error | null = null;
  let shouldSwitchModel = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Reranker] ${weekLabel}/${category} [${model}]: Retrying attempt ${attempt}/${maxRetries}`);
      }
      const response = await openai.chat.completions.create(request);
      if (attempt > 0) {
        console.log(`[Reranker] ${weekLabel}/${category} [${model}]: Succeeded after ${attempt} retries`);
      }
      // Type assertion: we're not using streams, so this will always be ChatCompletion
      return { response: response as any, shouldSwitchModel: false };
    } catch (err: any) {
      lastError = err;

      const isRateLimit = err.status === 429 || err.message?.includes('429') || err.message?.includes('rate limit');
      const isTransient = err.status >= 500 || err.message?.includes('timeout') || err.message?.includes('network');

      if (!isRateLimit && !isTransient) {
        throw err; // Non-retryable error
      }

      // If RPD/TPM error on first attempt, signal to switch to fallback model immediately
      if (isRateLimit && isRPDorTPMError(err) && attempt === 0) {
        shouldSwitchModel = true;
        throw err; // Exit immediately to switch models
      }

      if (attempt >= maxRetries) {
        break;
      }

      let baseWait = Math.min(1500 * Math.pow(2, attempt), 12000);
      const jitter = Math.floor(Math.random() * 300);
      let waitMs = baseWait + jitter;

      const retryAfterMatch = err.message?.match(/Please try again in (\d+)ms/i);
      if (retryAfterMatch) {
        const retryAfterMs = parseInt(retryAfterMatch[1], 10);
        waitMs = Math.max(waitMs, retryAfterMs);
      }

      console.warn(`[Reranker] ${weekLabel}/${category} [${model}]: API error (attempt ${attempt}/${maxRetries}), waiting ${waitMs}ms: ${err.message}`);
      await sleep(waitMs);
    }
  }

  throw lastError || new Error('OpenAI API call failed after retries');
}

async function callRerankLLM(
  category: Topic,
  categoryDisplayName: string,
  candidates: CandidateArticle[],
  weekLabel: string
): Promise<{ response: RerankResponse | null; modelUsed: string }> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn(`[Reranker] OPENAI_API_KEY not found, skipping LLM rerank`);
    return { response: null, modelUsed: '' };
  }

  const prompt = buildRerankPrompt(category, categoryDisplayName, candidates);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  
  // Try PRIMARY model first
  let currentModel = RERANK_MODEL_PRIMARY;
  let modelUsed = '';
  
  for (let modelAttempt = 0; modelAttempt < 2; modelAttempt++) {
    try {
      // Apply cooldown before each call
      await sleep(RERANK_COOLDOWN_MS);
      
      const request: Parameters<typeof openai.chat.completions.create>[0] = {
        model: currentModel,
        ...temperatureParam(currentModel, TEMPERATURE),
        ...maxTokensParam(currentModel, MAX_TOKENS),
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
        ...(currentModel.includes('gpt-4') || currentModel.includes('1106') || currentModel.includes('o-mini') || currentModel.includes('4.1')
          ? { response_format: { type: 'json_object' } as const }
          : {}),
      };
      
      const result = await callOpenAIWithRetry(openai, request, category, weekLabel, currentModel, 8);
      modelUsed = currentModel;

      if (result.shouldSwitchModel && modelAttempt === 0 && currentModel === RERANK_MODEL_PRIMARY) {
        console.warn(`[Reranker] ${weekLabel}/${category}: PRIMARY model [${currentModel}] hit RPD/TPM limit, switching to FALLBACK [${RERANK_MODEL_FALLBACK}]`);
        currentModel = RERANK_MODEL_FALLBACK;
        continue; // Retry with fallback model
      }

      const response = result.response;

      if (!response) {
        console.warn(`[Reranker] Empty response from LLM [${currentModel}]`);
        if (modelAttempt === 0 && currentModel === RERANK_MODEL_PRIMARY) {
          currentModel = RERANK_MODEL_FALLBACK;
          continue;
        }
        return { response: null, modelUsed: '' };
      }

      // Type guard: ensure response is not a stream
      if (!('choices' in response)) {
        console.warn(`[Reranker] Unexpected response type from LLM [${currentModel}]`);
        if (modelAttempt === 0 && currentModel === RERANK_MODEL_PRIMARY) {
          currentModel = RERANK_MODEL_FALLBACK;
          continue;
        }
        return { response: null, modelUsed: '' };
      }

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        console.warn(`[Reranker] Empty response from LLM [${currentModel}]`);
        if (modelAttempt === 0 && currentModel === RERANK_MODEL_PRIMARY) {
          // Try fallback model
          currentModel = RERANK_MODEL_FALLBACK;
          continue;
        }
        return { response: null, modelUsed: '' };
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
        console.warn(`[Reranker] Invalid response structure from LLM [${currentModel}]`);
        if (modelAttempt === 0 && currentModel === RERANK_MODEL_PRIMARY) {
          // Try fallback model
          currentModel = RERANK_MODEL_FALLBACK;
          continue;
        }
        return { response: null, modelUsed: '' };
      }

      console.log(`[Reranker] ${weekLabel}/${category}: Successfully used model [${modelUsed}]`);
      return { response: parsed as RerankResponse, modelUsed };
    } catch (err: any) {
      const isRPDorTPM = isRPDorTPMError(err);
      const isRateLimit = err.status === 429 || err.message?.includes('429') || err.message?.includes('rate limit');
      
      // If RPD/TPM error on PRIMARY, switch to FALLBACK immediately
      if (modelAttempt === 0 && currentModel === RERANK_MODEL_PRIMARY && isRateLimit && isRPDorTPM) {
        console.warn(`[Reranker] ${weekLabel}/${category}: PRIMARY model [${RERANK_MODEL_PRIMARY}] hit RPD/TPM limit, switching to FALLBACK [${RERANK_MODEL_FALLBACK}]`);
        currentModel = RERANK_MODEL_FALLBACK;
        continue; // Try fallback model
      }
      
      // If fallback also fails, or non-RPD/TPM error, return null
      console.warn(`[Reranker] ${weekLabel}/${category}: LLM call failed [${currentModel}]: ${err.message}`);
      if (modelAttempt === 0 && currentModel === RERANK_MODEL_PRIMARY && !isRPDorTPM) {
        // For non-RPD/TPM errors, try fallback once
        currentModel = RERANK_MODEL_FALLBACK;
        continue;
      }
      return { response: null, modelUsed: '' };
    }
  }
  
  // Both models failed
  return { response: null, modelUsed: '' };
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

  // NOTE: source diversity (max 3/source) and the Arxiv cap are intentionally
  // NOT validated here. They are *repairable* constraints, not structural
  // errors — enforcing them as validation caused the whole LLM ranking to be
  // discarded whenever the model over-picked from a dominant source (e.g.
  // Economic Times in AI, Fashionista in Luxury), silently falling back to the
  // deterministic selector and throwing away the model's judgment. The mapped
  // result is instead passed through applySourceDiversity(), which trims to
  // ≤3/source in the LLM's rank order and backfills the freed slots from the
  // rest of the pool — preserving the model's picks while still enforcing
  // diversity.
  return { valid: true };
}

function getCategoryDisplayName(category: Topic): string {
  return getTopicDisplayName(category);
}

/**
 * Apply source diversity enforcement to selected articles
 * - Max 3 articles per source in top 7
 * - Max 1 Arxiv article for AI category (all Arxiv sources count as one)
 * @param articles - Articles selected by LLM (or fallback)
 * @param category - Topic category
 * @param totalCandidatesCount - Total number of candidates available
 * @param allCandidates - Optional: full candidate pool for backfilling if articles.length < 7
 */
function applySourceDiversity<T extends Article & { snippet?: string }>(
  articles: T[],
  category: Topic,
  totalCandidatesCount: number,
  allCandidates?: T[]
): T[] {
  const DEBUG = process.env.RERANK_DEBUG === 'true' || category === 'AI_and_Strategy';
  
  if (DEBUG) {
    console.log(`[SourceDiversity] ${category}: Starting with ${articles.length} articles`);
  }
  
  const MAX_PER_SOURCE = 3;
  const MAX_ARXIV_AI = category === 'AI_and_Strategy' ? 1 : Infinity; // Max 1 Arxiv article for AI category
  const sourceCounts = new Map<string, number>();
  let arxivCount = 0; // Track total Arxiv articles for AI category (all Arxiv sources combined)
  const finalSelected: T[] = [];
  const skipped: T[] = [];
  
  // Helper to check if source is Arxiv (any Arxiv source)
  const isArxiv = (source: string): boolean => {
    return source.toLowerCase().includes('arxiv');
  };
  
  // Helper to get normalized source for counting (all Arxiv sources count as "Arxiv" for AI category limit)
  const getNormalizedSource = (source: string): string => {
    if (category === 'AI_and_Strategy' && isArxiv(source)) {
      return 'Arxiv'; // All Arxiv sources count as one for AI category
    }
    return source;
  };
  
  for (const article of articles) {
    const normalizedSource = getNormalizedSource(article.source);
    const currentCount = sourceCounts.get(normalizedSource) || 0;
    const isArxivArticle = isArxiv(article.source);
    
    // Check if we can add this article
    const canAddSource = currentCount < MAX_PER_SOURCE;
    const canAddArxiv = !isArxivArticle || arxivCount < MAX_ARXIV_AI;
    
    if (DEBUG && !canAddSource) {
      console.log(`[SourceDiversity] ${category}: Skipping "${article.title.substring(0, 50)}..." - source "${normalizedSource}" already has ${currentCount} articles (max ${MAX_PER_SOURCE})`);
    }
    if (DEBUG && !canAddArxiv && isArxivArticle) {
      console.log(`[SourceDiversity] ${category}: Skipping "${article.title.substring(0, 50)}..." - Arxiv limit reached (${arxivCount}/${MAX_ARXIV_AI})`);
    }
    
    if (canAddSource && canAddArxiv) {
      finalSelected.push(article);
      sourceCounts.set(normalizedSource, currentCount + 1);
      if (isArxivArticle) {
        arxivCount++;
      }
      if (DEBUG) {
        console.log(`[SourceDiversity] ${category}: Added "${article.title.substring(0, 50)}..." from "${normalizedSource}" (count: ${currentCount + 1}, arxiv: ${arxivCount})`);
      }
    } else {
      skipped.push(article);
    }
  }
  
  if (DEBUG) {
    console.log(`[SourceDiversity] ${category}: After initial pass - selected: ${finalSelected.length}, skipped: ${skipped.length}`);
    console.log(`[SourceDiversity] ${category}: Source counts:`, Array.from(sourceCounts.entries()).map(([s, c]) => `${s}:${c}`).join(', '));
    console.log(`[SourceDiversity] ${category}: Arxiv count: ${arxivCount}/${MAX_ARXIV_AI}`);
  }
  
  // If we have fewer than 7 after enforcing diversity, try to fill from:
  // 1. First, try skipped articles (from LLM selection)
  // 2. Then, if allCandidates provided, try backfilling from full candidate pool
  const targetCount = Math.min(7, totalCandidatesCount);
  
  if (DEBUG) {
    console.log(`[SourceDiversity] ${category}: Target count: ${targetCount}, Current: ${finalSelected.length}`);
  }
  
  // Backfill from skipped articles first
  if (finalSelected.length < targetCount && skipped.length > 0) {
    if (DEBUG) {
      console.log(`[SourceDiversity] ${category}: Attempting to backfill from ${skipped.length} skipped articles`);
    }
    let backfilledFromSkipped = 0;
    for (const article of skipped) {
      if (finalSelected.length >= targetCount) break;
      const normalizedSource = getNormalizedSource(article.source);
      const currentCount = sourceCounts.get(normalizedSource) || 0;
      const isArxivArticle = isArxiv(article.source);
      const canAddSource = currentCount < MAX_PER_SOURCE;
      const canAddArxiv = !isArxivArticle || arxivCount < MAX_ARXIV_AI;
      
      if (canAddSource && canAddArxiv) {
        finalSelected.push(article);
        sourceCounts.set(normalizedSource, currentCount + 1);
        if (isArxivArticle) {
          arxivCount++;
        }
        backfilledFromSkipped++;
        if (DEBUG) {
          console.log(`[SourceDiversity] ${category}: Backfilled from skipped: "${article.title.substring(0, 50)}..." from "${normalizedSource}"`);
        }
      }
    }
    if (DEBUG) {
      console.log(`[SourceDiversity] ${category}: Backfilled ${backfilledFromSkipped} articles from skipped list`);
    }
  }
  
  // If still not enough and we have the full candidate pool, backfill from it
  // SOLUTION 2: Prioritize non-Arxiv articles when Arxiv limit is reached
  if (finalSelected.length < targetCount && allCandidates && allCandidates.length > 0) {
    if (DEBUG) {
      console.log(`[SourceDiversity] ${category}: Still need ${targetCount - finalSelected.length} articles, attempting backfill from ${allCandidates.length} candidate pool`);
    }
    // Create a set of already-selected URLs to avoid duplicates
    const selectedUrls = new Set(finalSelected.map(a => a.url));
    
    // Filter out Arxiv articles if Arxiv limit is already reached (for AI category)
    const eligibleCandidates = (category === 'AI_and_Strategy' && arxivCount >= MAX_ARXIV_AI)
      ? allCandidates.filter(a => !isArxiv(a.source))
      : allCandidates;
    
    if (DEBUG && eligibleCandidates.length < allCandidates.length) {
      console.log(`[SourceDiversity] ${category}: Filtered out ${allCandidates.length - eligibleCandidates.length} Arxiv articles (limit reached)`);
    }
    
    let backfilledFromPool = 0;
    // Try to add articles from the eligible candidate pool that weren't already selected
    for (const article of eligibleCandidates) {
      if (finalSelected.length >= targetCount) break;
      if (selectedUrls.has(article.url)) continue; // Skip if already selected
      
      const normalizedSource = getNormalizedSource(article.source);
      const currentCount = sourceCounts.get(normalizedSource) || 0;
      const isArxivArticle = isArxiv(article.source);
      const canAddSource = currentCount < MAX_PER_SOURCE;
      const canAddArxiv = !isArxivArticle || arxivCount < MAX_ARXIV_AI;
      
      if (canAddSource && canAddArxiv) {
        finalSelected.push(article);
        sourceCounts.set(normalizedSource, currentCount + 1);
        selectedUrls.add(article.url);
        if (isArxivArticle) {
          arxivCount++;
        }
        backfilledFromPool++;
        if (DEBUG) {
          console.log(`[SourceDiversity] ${category}: Backfilled from pool: "${article.title.substring(0, 50)}..." from "${normalizedSource}"`);
        }
      }
    }
    if (DEBUG) {
      console.log(`[SourceDiversity] ${category}: Backfilled ${backfilledFromPool} articles from candidate pool`);
    }
  }
  
  if (DEBUG) {
    console.log(`[SourceDiversity] ${category}: Final count: ${finalSelected.length}/${targetCount}`);
    if (finalSelected.length < targetCount) {
      console.warn(`[SourceDiversity] ${category}: ⚠️  Only ${finalSelected.length} articles selected (target: ${targetCount})`);
      console.warn(`[SourceDiversity] ${category}: Source distribution:`, Array.from(sourceCounts.entries()).map(([s, c]) => `${s}:${c}`).join(', '));
      console.warn(`[SourceDiversity] ${category}: Arxiv count: ${arxivCount}/${MAX_ARXIV_AI}`);
    }
  }
  
  return finalSelected;
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

  // Compute commerce materiality scores for all candidates
  const materialityScores = new Map<string, { score: number; signals: string[] }>();
  for (const article of candidates) {
    const materiality = computeCommerceMateriality({
      title: article.title,
      source: article.source,
      snippet: article.snippet,
      aiSummary: (article as any).aiSummary
    });
    materialityScores.set(article.url, {
      score: materiality.score,
      signals: materiality.signals
    });
  }
  
  // Build candidate list with bounded fields (no scores, just flags and metadata)
  const candidateList: CandidateArticle[] = candidates.map((article, idx) => {
    const gate = (article as any).gate;
    const materiality = materialityScores.get(article.url);
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
      commerceMaterialityScore: materiality?.score,
      commerceMaterialitySignals: materiality?.signals,
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

  // Accept cache if it matches either PRIMARY or FALLBACK model (for backward compatibility)
  if (cached && (cached.model === RERANK_MODEL_PRIMARY || cached.model === RERANK_MODEL_FALLBACK)) {
    stats.cache_hits++;
    categoryStat.cache_hit = true;
    
    // IMPORTANT: Cached results are based on trimmed candidates, so we need to map them correctly
    // The cache was created with a specific trimmed candidate list, but we need to map to current candidates
    // Since cache key includes fingerprint, candidates should match, but we still need proper mapping
    // Build trimmed candidates for mapping (same logic as fresh LLM call)
    const { trimmed: trimmedCandidatesForMapping } = trimCandidatesToBudget(candidateList);
    
    // Map cached results back to articles using trimmed-to-original mapping
    const trimmedToOriginalForCache = new Map<number, number>();
    trimmedCandidatesForMapping.forEach((trimmed, idx) => {
      const originalIdx = candidateList.findIndex(c => c.url === trimmed.url);
      if (originalIdx >= 0) {
        trimmedToOriginalForCache.set(idx, originalIdx);
      }
    });
    
    let selected = cached.selected
      .sort((a, b) => a.rank - b.rank)
      .map(item => {
        const trimmedIdx = parseInt(item.id, 10);
        const originalIdx = trimmedToOriginalForCache.get(trimmedIdx);
        if (originalIdx === undefined) {
          // Fallback: try direct index if mapping fails (for backward compatibility)
          const directCandidate = candidates[trimmedIdx];
          if (directCandidate) return directCandidate;
          return null;
        }
        return candidates[originalIdx];
      })
      .filter(Boolean) as T[];

    // PHASE 3: Apply source diversity enforcement (always, even when LLM succeeds)
    // Note: Materiality boost is NOT applied when LLM succeeds - only in fallback
    // Pass full candidate pool for backfilling if needed
    selected = applySourceDiversity(selected, category, candidates.length, candidates);

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

  // Trim candidates to fit within budget (max items and max chars)
  const { trimmed: trimmedCandidates, totalChars } = trimCandidatesToBudget(candidateList);
  
  console.log(`[Reranker] ${weekLabel}/${category}: candidates=${candidateList.length}, items_sent=${trimmedCandidates.length}, chars_sent=${totalChars}, cooldown_ms=${RERANK_COOLDOWN_MS}`);

  // Call LLM (with model failover)
  const categoryDisplayName = getCategoryDisplayName(category);
  let llmResponse: RerankResponse | null = null;
  let modelUsed = '';
  
  try {
    const result = await callRerankLLM(category, categoryDisplayName, trimmedCandidates, weekLabel);
    llmResponse = result.response;
    modelUsed = result.modelUsed;
  } catch (err: any) {
    console.warn(`[Reranker] ${weekLabel}/${category}: LLM call failed after both models, using fallback: ${err.message}`);
  }
  
  if (!llmResponse) {
    console.log(`[Reranker] ${weekLabel}/${category}: fallback (both models exhausted)`);
  }

  // Helper function to apply materiality boost and source diversity to fallback results
  const applyFallbackPostProcessing = (selected: T[]): T[] => {
    // PHASE 3: Apply materiality boost (only when LLM failed)
    // Determine weight based on category
    let materialityWeight = COMMERCE_MATERIALITY_WEIGHT_OTHER;
    if (category === 'Ecommerce_Retail_Tech') {
      materialityWeight = COMMERCE_MATERIALITY_WEIGHT_ECOM;
    } else if (category === 'AI_and_Strategy') {
      materialityWeight = 0.1;
    } else if (category === 'Luxury_and_Consumer' || category === 'Jewellery_Industry') {
      materialityWeight = COMMERCE_MATERIALITY_WEIGHT_EMAIL;
    }
    
    const articlesWithScores = selected.map((article, idx) => {
      const materiality = materialityScores.get(article.url);
      const materialityScore = materiality?.score || 0;
      const originalRank = idx + 1;
      const materialityBoost = materialityScore * materialityWeight;
      const combinedScore = originalRank - materialityBoost; // Lower is better (subtract boost)
      return { article, combinedScore, materialityScore };
    });
    
    articlesWithScores.sort((a, b) => a.combinedScore - b.combinedScore);
    let ranked = articlesWithScores.map(item => item.article);
    
    // Apply source diversity enforcement to fallback results
    // Pass full candidate pool for backfilling if needed
    return applySourceDiversity(ranked, category, candidates.length, candidates);
  };

  if (!llmResponse) {
    console.warn(`[Reranker] LLM call failed for ${weekLabel}/${category}, using fallback`);
    stats.fallbacks++;
    let selected = fallbackSelect(candidates);
    selected = applyFallbackPostProcessing(selected);
    categoryStat.selected_count = selected.length;
    categoryStat.skip_reason = 'LLM call failed';
    stats.category_stats.push(categoryStat);
    return {
      selected,
      fromCache: false,
      fromFallback: true,
    };
  }

  // Validate response (using trimmed candidates for validation)
  const validation = validateRerankResponse(llmResponse, trimmedCandidates);
  if (!validation.valid) {
    console.warn(`[Reranker] Invalid LLM response for ${weekLabel}/${category}: ${validation.error}, using fallback`);
    stats.fallbacks++;
    let selected = fallbackSelect(candidates);
    selected = applyFallbackPostProcessing(selected);
    categoryStat.selected_count = selected.length;
    categoryStat.skip_reason = `Invalid response: ${validation.error}`;
    stats.category_stats.push(categoryStat);
    return {
      selected,
      fromCache: false,
      fromFallback: true,
    };
  }

  // Map results back to articles (using original candidates array, not trimmed)
  // IMPORTANT: trimmedCandidates may be reordered by trimCandidatesToBudget, so we can't rely on index order
  // Instead, we need to map by URL (or title+source) to find the original candidate
  
  // Build a map from trimmed candidate URL to original candidate index
  const urlToOriginalIdx = new Map<string, number>();
  candidateList.forEach((candidate, idx) => {
    urlToOriginalIdx.set(candidate.url, idx);
  });
  
  // Also build a map from title+source to original index (for fallback)
  const titleSourceToOriginalIdx = new Map<string, number>();
  candidateList.forEach((candidate, idx) => {
    const key = `${candidate.title}|||${candidate.source}`;
    if (!titleSourceToOriginalIdx.has(key)) {
      titleSourceToOriginalIdx.set(key, idx);
    }
  });
  
  const mappingFailures: string[] = [];
  let mappedCount = 0;
  
  let selected = llmResponse.selected
    .sort((a, b) => a.rank - b.rank)
    .map(item => {
      const trimmedIdx = parseInt(item.id, 10);
      
      // Validate trimmed index
      if (trimmedIdx < 0 || trimmedIdx >= trimmedCandidates.length) {
        console.warn(`[Reranker] ${weekLabel}/${category}: Invalid trimmed index ${trimmedIdx} (trimmedCandidates.length=${trimmedCandidates.length})`);
        return null;
      }
      
      const trimmedCandidate = trimmedCandidates[trimmedIdx];
      if (!trimmedCandidate) {
        console.warn(`[Reranker] ${weekLabel}/${category}: No candidate at trimmed index ${trimmedIdx}`);
        return null;
      }
      
      // Try to find original candidate by URL
      let originalIdx = urlToOriginalIdx.get(trimmedCandidate.url);
      
      // If URL match fails, try title+source match
      if (originalIdx === undefined) {
        const key = `${trimmedCandidate.title}|||${trimmedCandidate.source}`;
        originalIdx = titleSourceToOriginalIdx.get(key);
      }
      
      if (originalIdx === undefined) {
        mappingFailures.push(`Trimmed idx ${trimmedIdx}: "${trimmedCandidate.title}" from ${trimmedCandidate.source}`);
        return null;
      }
      
      const mappedCandidate = candidates[originalIdx];
      if (!mappedCandidate) {
        console.warn(`[Reranker] ${weekLabel}/${category}: Mapped index ${originalIdx} is out of bounds (candidates.length=${candidates.length})`);
        return null;
      }
      
      // Verify the mapped candidate matches (safety check)
      if (mappedCandidate.url !== trimmedCandidate.url && 
          !(mappedCandidate.title === trimmedCandidate.title && mappedCandidate.source === trimmedCandidate.source)) {
        console.warn(`[Reranker] ${weekLabel}/${category}: Mapped candidate doesn't match trimmed candidate at idx ${trimmedIdx}`);
        return null;
      }
      
      mappedCount++;
      return mappedCandidate;
    })
    .filter(Boolean) as T[];
  
  // Log mapping results for debugging
  if (mappingFailures.length > 0) {
    console.warn(`[Reranker] ${weekLabel}/${category}: ${mappingFailures.length} mapping failures:`, mappingFailures.slice(0, 3));
  }
  
  const DEBUG_AI = category === 'AI_and_Strategy';
  
  if (selected.length < llmResponse.selected.length) {
    console.warn(`[Reranker] ${weekLabel}/${category}: Only ${selected.length}/${llmResponse.selected.length} articles successfully mapped from LLM response`);
  } else {
    console.log(`[Reranker] ${weekLabel}/${category}: Successfully mapped ${selected.length} articles from LLM response`);
  }
  
  if (DEBUG_AI) {
    console.log(`[Reranker] ${weekLabel}/${category}: BEFORE source diversity - ${selected.length} articles`);
    const sources = new Map<string, number>();
    let arxivCount = 0;
    selected.forEach(a => {
      const src = a.source;
      sources.set(src, (sources.get(src) || 0) + 1);
      if (src.toLowerCase().includes('arxiv')) arxivCount++;
    });
    console.log(`[Reranker] ${weekLabel}/${category}: Source breakdown:`, Array.from(sources.entries()).map(([s, c]) => `${s}:${c}`).join(', '));
    console.log(`[Reranker] ${weekLabel}/${category}: Arxiv articles: ${arxivCount}`);
  }

    // PHASE 3: Apply source diversity enforcement (always, even when LLM succeeds)
    // Note: Materiality boost is NOT applied when LLM succeeds - only in fallback
    // Pass full candidate pool for backfilling if needed
    const beforeDiversity = selected.length;
    selected = applySourceDiversity(selected, category, candidates.length, candidates);
    
    if (DEBUG_AI) {
      console.log(`[Reranker] ${weekLabel}/${category}: AFTER source diversity - ${selected.length} articles (dropped ${beforeDiversity - selected.length})`);
    }

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
    model: modelUsed || RERANK_MODEL_PRIMARY, // Use the model that was actually used
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

