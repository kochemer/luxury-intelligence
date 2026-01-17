import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { getWeekRangeCET } from '../utils/weekCET';
import { classifyTopic } from '../classification/classifyTopics';
import type { Article as BaseArticle, Topic } from '../classification/classifyTopics';
import { classifyArticleLLM, getClassificationStats, resetClassificationStats } from '../classification/classifyWithLLM';
import { rerankArticles, getRerankStats, resetRerankStats } from './rerankArticles';

// Extended Article type that includes snippet and discovery fields (used in actual data)
type Article = BaseArticle & {
  snippet?: string;
  discoveredAt?: string;
  publishedDateInvalid?: boolean;
  usedDiscoveredAtFallback?: boolean;
  sourceType?: 'rss' | 'page' | 'discovery';
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOP_N = 7;
const MAX_PER_SOURCE = 3; // Diversity guard: max articles per source in top N

// --- Article Gating Configuration ---

/**
 * Low-signal markers that indicate sponsored/press release content
 * Case-insensitive matching in title and snippet
 */
const LOW_SIGNAL_MARKERS = [
  "sponsored", "press release", "advertorial", "advertisement", "promoted",
  "paid content", "sponsored content", "ad", "promo"
];

/**
 * Controversy markers - exclude articles primarily about these topics
 */
const CONTROVERSY_MARKERS = {
  war: ["war", "armed conflict", "violence", "military action", "combat", "battle", "invasion", "attack", "bombing", "drone strike"],
  cultureWar: ["culture war", "identity politics", "woke", "cancel culture", "political correctness", "gender ideology", "critical race theory"],
  election: ["election", "campaign", "polling", "voter", "candidate", "primary", "debate", "ballot", "electoral"],
};

/**
 * Policy/regulation allowlist terms - these are allowed even if they mention controversy markers
 * Must be directly related to retail/ecommerce/AI impact
 */
const POLICY_ALLOWLIST = [
  "tariff", "tariffs", "trade policy", "trade war", "trade agreement",
  "regulation", "regulatory", "compliance", "AI Act", "GDPR", "privacy law",
  "data protection", "platform regulation", "antitrust", "competition law",
  "consumer protection", "retail regulation", "ecommerce regulation"
];

/**
 * Normalize a title for deduplication:
 *  - Lowercase
 *  - Collapse whitespace
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicate articles within a topic by normalized title,
 * keeping the newest published_at. 
 */
function dedupeArticles(articles: Article[]): Article[] {
  const map = new Map<string, Article>();
  for (const art of articles) {
    const normTitle = normalizeTitle(art.title);
    if (!map.has(normTitle)) {
      map.set(normTitle, art);
    } else {
      // Keep the newer version
      const existing = map.get(normTitle)!;
      const artTime = art.published_at ? new Date(art.published_at).getTime() : 0;
      const existTime = existing.published_at ? new Date(existing.published_at).getTime() : 0;
      if (artTime > existTime) {
        map.set(normTitle, art);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Article gating result - determines eligibility, not ranking
 */
type ArticleGate = {
  eligible: boolean;
  reasons: string[];
  flags: {
    sponsored?: boolean;
    pressRelease?: boolean;
    duplicateOf?: string;
    offCategory?: boolean;
    controversial?: boolean;
    controversialSuspected?: boolean;
  };
  tier?: "high" | "med" | "low"; // Optional category-match tier (not for ranking)
};

/**
 * Article with gating information (only added to selected top items)
 */
type ArticleWithGate = Article & {
  gate?: ArticleGate;
};

/**
 * Check if text contains any of the given markers (case-insensitive)
 */
function containsMarkers(text: string, markers: string[]): boolean {
  const lowerText = text.toLowerCase();
  return markers.some(marker => lowerText.includes(marker.toLowerCase()));
}

/**
 * Check if text contains any allowlist terms (case-insensitive)
 */
function containsAllowlist(text: string, allowlist: string[]): boolean {
  const lowerText = text.toLowerCase();
  return allowlist.some(term => lowerText.includes(term.toLowerCase()));
}

/**
 * Detect controversy in article content
 * Returns: { isControversial: boolean, isSuspected: boolean }
 */
function detectControversy(article: Article): { isControversial: boolean; isSuspected: boolean } {
  const text = `${article.title} ${article.snippet || ''}`;
  const lowerText = text.toLowerCase();
  
  // Check for policy allowlist first - if found, allow even if controversy markers present
  const hasPolicyContext = containsAllowlist(text, POLICY_ALLOWLIST);
  
  // Check each controversy category
  const hasWar = containsMarkers(text, CONTROVERSY_MARKERS.war);
  const hasCultureWar = containsMarkers(text, CONTROVERSY_MARKERS.cultureWar);
  const hasElection = containsMarkers(text, CONTROVERSY_MARKERS.election);
  
  // If policy context exists, don't exclude even if controversy markers found
  if (hasPolicyContext && (hasWar || hasCultureWar || hasElection)) {
    return { isControversial: false, isSuspected: false };
  }
  
  // If clear controversy markers without policy context, exclude
  if (hasWar || hasCultureWar || hasElection) {
    // Check if it's ambiguous (e.g., mentions both controversy and retail/commerce)
    const hasRetailContext = containsMarkers(text, ["retail", "commerce", "ecommerce", "shopping", "customer", "merchant", "store", "brand"]);
    if (hasRetailContext) {
      // Ambiguous - mark as suspected but don't exclude deterministically
      return { isControversial: false, isSuspected: true };
    }
    return { isControversial: true, isSuspected: false };
  }
  
  return { isControversial: false, isSuspected: false };
}

/**
 * Gate an article - determine eligibility and flags (no ranking)
 * Implements soft week-window logic for discovery articles
 */
function gateArticle(
  article: Article,
  topic: Topic,
  duplicateMap: Map<string, string>, // normalized title -> URL of duplicate
  weekStart: number,
  weekEnd: number
): ArticleGate {
  const reasons: string[] = [];
  const flags: ArticleGate['flags'] = {};
  const isDiscovery = article.sourceType === 'discovery';
  
  // Week window check with soft logic for discovery articles
  let withinWindow = false;
  let usedFallback = false;
  
  if (isDiscovery) {
    // Soft week-window logic for discovery articles
    const oneDayMs = 24 * 60 * 60 * 1000;
    const softWeekStart = weekStart - oneDayMs;
    const softWeekEnd = weekEnd + oneDayMs;
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const maxAgeCutoff = weekStart - maxAgeMs;
    
    // Try publishedAt first (if valid)
    if (article.published_at && !article.publishedDateInvalid) {
      const publishedTime = new Date(article.published_at).getTime();
      if (!isNaN(publishedTime)) {
        // Check guardrail: never include articles older than 30 days before week start
        if (publishedTime < maxAgeCutoff) {
          return { eligible: false, reasons: ["Too old (publishedAt < weekStart - 30 days)"], flags };
        }
        // Check soft window
        if (publishedTime >= softWeekStart && publishedTime <= softWeekEnd) {
          withinWindow = true;
        }
      }
    }
    
    // Fallback to discoveredAt if publishedAt is invalid/missing or outside soft window
    if (!withinWindow && article.discoveredAt) {
      const discoveredTime = new Date(article.discoveredAt).getTime();
      if (!isNaN(discoveredTime)) {
        // Check guardrail: never include articles discovered too long ago
        if (discoveredTime < maxAgeCutoff) {
          return { eligible: false, reasons: ["Too old (discoveredAt < weekStart - 30 days)"], flags };
        }
        // Check if discovered within week window (strict, not soft)
        if (discoveredTime >= weekStart && discoveredTime <= weekEnd) {
          withinWindow = true;
          usedFallback = true;
          // Set published_at to discoveredAt for consistency (but flag it)
          (article as any).published_at = article.discoveredAt;
        }
      }
    }
    
    if (!withinWindow) {
      return { eligible: false, reasons: ["Outside week window (discovery)"], flags };
    }
  } else {
    // Strict week-window logic for RSS/page articles (unchanged)
    if (!article.published_at) {
      return { eligible: false, reasons: ["Missing published_at"], flags };
    }
    
    const articleTime = new Date(article.published_at).getTime();
    if (isNaN(articleTime) || articleTime < weekStart || articleTime > weekEnd) {
      return { eligible: false, reasons: ["Outside week window"], flags };
    }
    withinWindow = true;
  }
  
  // Check for sponsored/press release content
  const text = `${article.title} ${article.snippet || ''}`;
  const lowerText = text.toLowerCase();
  
  const isSponsored = LOW_SIGNAL_MARKERS.some(marker => lowerText.includes(marker.toLowerCase()));
  if (isSponsored) {
    flags.sponsored = true;
    flags.pressRelease = true;
    reasons.push("Sponsored/press release content");
    // Don't exclude - let LLM decide, but flag it
  }
  
  // Check for duplicates
  const normTitle = normalizeTitle(article.title);
  const duplicateOf = duplicateMap.get(normTitle);
  if (duplicateOf && duplicateOf !== article.url) {
    flags.duplicateOf = duplicateOf;
    reasons.push("Duplicate article");
    return { eligible: false, reasons, flags };
  }
  
  // Check for controversy
  const { isControversial, isSuspected } = detectControversy(article);
  if (isControversial) {
    flags.controversial = true;
    reasons.push("Controversial topic (war/culture-war/election)");
    return { eligible: false, reasons, flags };
  }
  if (isSuspected) {
    flags.controversialSuspected = true;
    reasons.push("Potentially controversial (flagged for LLM review)");
  }
  
  // Determine tier based on category match (optional, not for ranking)
  // This is a simple heuristic - can be refined
  let tier: "high" | "med" | "low" = "med";
  // For now, all eligible articles are "med" tier - LLM will do the ranking
  
  // Set fallback flag if used
  if (usedFallback && isDiscovery) {
    (article as any).usedDiscoveredAtFallback = true;
  }
  
  return {
    eligible: true,
    reasons: reasons.length > 0 ? reasons : ["Eligible"],
    flags,
    tier,
  };
}

/**
 * Select top N articles deterministically (fallback for reranking)
 * Uses simple source diversity - no scoring, just gating + diversity
 */
function selectTopNDeterministic(
  articles: Article[],
  n: number,
  topic: Topic,
  weekStart: number,
  weekEnd: number
): ArticleWithGate[] {
  if (articles.length === 0) return [];
  
  // Build duplicate map
  const duplicateMap = new Map<string, string>();
  const seenTitles = new Map<string, string>(); // normalized title -> URL
  for (const article of articles) {
    const normTitle = normalizeTitle(article.title);
    const existing = seenTitles.get(normTitle);
    if (existing) {
      duplicateMap.set(normTitle, existing);
    } else {
      seenTitles.set(normTitle, article.url);
    }
  }
  
  // Gate all articles
  const gatedArticles = articles.map(article => ({
    article,
    gate: gateArticle(article, topic, duplicateMap, weekStart, weekEnd),
  }));
  
  // Filter to eligible only
  const eligible = gatedArticles.filter(item => item.gate.eligible);
  
  // Sort by URL for determinism (no scoring)
  eligible.sort((a, b) => a.article.url.localeCompare(b.article.url));
  
  // Apply diversity guard: limit max per source, but relax if needed to fill to N
  const selected: ArticleWithGate[] = [];
  const sourceCounts = new Map<string, number>();
  
  for (let i = 0; i < eligible.length && selected.length < n; i++) {
    const { article, gate } = eligible[i];
    const currentCount = sourceCounts.get(article.source) || 0;
    const remainingSlots = n - selected.length;
    const remainingArticles = eligible.length - i;
    
    // Check if we can add this article:
    // 1. Haven't hit the cap for this source, OR
    // 2. We need to fill remaining slots (relax cap if not enough articles from other sources)
    const canAdd = currentCount < MAX_PER_SOURCE;
    const mustFill = remainingSlots >= remainingArticles;
    
    if (canAdd || mustFill) {
      selected.push({
        ...article,
        gate,
      });
      sourceCounts.set(article.source, currentCount + 1);
    }
  }
  
  return selected;
}

/**
 * Select top N articles using LLM reranking with fallback
 * Returns articles with gating info and optional explainability attached
 */
async function selectTopN(
  articles: Article[],
  n: number,
  topic: Topic,
  weekStart: number,
  weekEnd: number,
  weekLabel: string
): Promise<ArticleWithGate[]> {
  if (articles.length === 0) return [];
  
  // Build duplicate map
  const duplicateMap = new Map<string, string>();
  const seenTitles = new Map<string, string>(); // normalized title -> URL
  for (const article of articles) {
    const normTitle = normalizeTitle(article.title);
    const existing = seenTitles.get(normTitle);
    if (existing) {
      duplicateMap.set(normTitle, existing);
    } else {
      seenTitles.set(normTitle, article.url);
    }
  }
  
  // Gate all articles
  const gatedArticles = articles.map(article => ({
    article,
    gate: gateArticle(article, topic, duplicateMap, weekStart, weekEnd),
  }));
  
  // Filter to eligible only
  const eligible = gatedArticles.filter(item => item.gate.eligible);
  
  // Sort by URL for determinism (no scoring - LLM will do ranking)
  eligible.sort((a, b) => a.article.url.localeCompare(b.article.url));
  
  // Get candidates: all eligible articles (up to 100 max for cost control)
  const candidateCount = Math.min(100, eligible.length);
  const candidates = eligible.slice(0, candidateCount).map(item => ({
    ...item.article,
    gate: item.gate,
  }));
  
  // Fallback function: deterministic top N (simple diversity-based)
  const fallbackSelect = (arts: ArticleWithGate[]) => {
    return selectTopNDeterministic(arts, n, topic, weekStart, weekEnd);
  };
  
  // Rerank using LLM (pass total available count for logging)
  const result = await rerankArticles(
    weekLabel,
    topic,
    articles.length, // total available in category
    candidates,
    fallbackSelect
  );
  
  // Attach explainability if available
  if (result.explainability) {
    result.selected.forEach((article, idx) => {
      if (result.explainability && result.explainability[idx]) {
        (article as any).rerankWhy = result.explainability[idx].rerankWhy;
        (article as any).rerankConfidence = result.explainability[idx].rerankConfidence;
      }
    });
  }
  
  return result.selected;
}

export type WeeklyDigest = {
  weekLabel: string;
  tz: string;
  startISO: string;
  endISO: string;
  builtAtISO?: string;
  builtAtLocal?: string;
  coverImageUrl?: string;
  coverImageAlt?: string;
  coverKeywords?: string[];
  keyThemes?: string[];
  oneSentenceSummary?: string;
  introParagraph?: string;
  totals: {
    total: number;
    byTopic: {
      AIStrategy: number;
      EcommerceRetail: number;
      LuxuryConsumer: number;
      Jewellery: number;
    };
  };
  topics: {
    AI_and_Strategy: { total: number; top: ArticleWithGate[] };
    Ecommerce_Retail_Tech: { total: number; top: ArticleWithGate[] };
    Luxury_and_Consumer: { total: number; top: ArticleWithGate[] };
    Jewellery_Industry: { total: number; top: ArticleWithGate[] };
  };
};

/**
 * Builds a weekly digest from articles in data/articles.json and discovery articles for the week
 * @param weekLabel - Week in format "YYYY-W##" (e.g. "2025-W52")
 * @returns Weekly digest object with totals and topic breakdowns
 */
export async function buildWeeklyDigest(weekLabel: string): Promise<WeeklyDigest> {
  // Parse weekLabel to create a Date (use Monday of the week)
  const weekMatch = weekLabel.match(/^(\d{4})-W(\d{1,2})$/);
  if (!weekMatch) {
    throw new Error(`Invalid weekLabel format: ${weekLabel}. Expected "YYYY-W##" (e.g. "2025-W52")`);
  }
  
  const year = parseInt(weekMatch[1], 10);
  const weekNumber = parseInt(weekMatch[2], 10);
  
  if (weekNumber < 1 || weekNumber > 53) {
    throw new Error(`Invalid week number: ${weekNumber}. Must be between 1 and 53.`);
  }
  
  // Create a DateTime in Europe/Copenhagen for the given week
  // Use Luxon to get the Monday of that week
  const dt = DateTime.fromObject({ weekYear: year, weekNumber }, { zone: 'Europe/Copenhagen' });
  if (!dt.isValid) {
    throw new Error(`Invalid week: ${weekLabel}. ${dt.invalidReason}`);
  }
  
  // Get the week range
  const { weekStartCET, weekEndCET } = getWeekRangeCET(dt.toJSDate());
  
  const startISO = weekStartCET.toISOString();
  const endISO = weekEndCET.toISOString();
  
  // Load articles from global articles.json
  const dataPath = path.join(__dirname, '../data/articles.json');
  let articles: Article[] = [];
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    articles = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to read articles.json: ${(err as Error).message}`);
  }
  
  // Load discovery articles for this week (if they exist)
  const weekDir = path.join(__dirname, '../data/weeks', weekLabel);
  const discoveryArticlesPath = path.join(weekDir, 'discoveryArticles.json');
  let discoveryArticles: Article[] = [];
  try {
    const raw = await fs.readFile(discoveryArticlesPath, 'utf-8');
    discoveryArticles = JSON.parse(raw);
    console.log(`[Build] Loaded ${discoveryArticles.length} discovery articles for ${weekLabel}`);
  } catch (err) {
    // Discovery articles don't exist for this week, that's okay
    console.log(`[Build] No discovery articles found for ${weekLabel}`);
  }
  
  // Merge discovery articles with regular articles (discovery articles take precedence for duplicates)
  const articlesByUrl = new Map<string, Article>();
  for (const article of articles) {
    articlesByUrl.set(article.url, article);
  }
  // Add discovery articles, overwriting any duplicates
  for (const article of discoveryArticles) {
    articlesByUrl.set(article.url, article);
  }
  // Convert back to array
  const allArticles = Array.from(articlesByUrl.values());
  
  // Filter articles to the week window with soft logic for discovery articles
  const weekStart = weekStartCET.getTime();
  const weekEnd = weekEndCET.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  const maxAgeCutoff = weekStart - maxAgeMs;
  
  const eligibleArticles = allArticles.filter(article => {
    const isDiscovery = article.sourceType === 'discovery';
    
    if (isDiscovery) {
      // Soft week-window logic for discovery articles
      const softWeekStart = weekStart - oneDayMs;
      const softWeekEnd = weekEnd + oneDayMs;
      
      // Try publishedAt first (if valid)
      if (article.published_at && !article.publishedDateInvalid) {
        const publishedTime = new Date(article.published_at).getTime();
        if (!isNaN(publishedTime)) {
          // Guardrail: never include articles older than 30 days before week start
          if (publishedTime < maxAgeCutoff) return false;
          // Check soft window
          if (publishedTime >= softWeekStart && publishedTime <= softWeekEnd) {
            return true;
          }
        }
      }
      
      // Fallback to discoveredAt if publishedAt is invalid/missing or outside soft window
      if (article.discoveredAt) {
        const discoveredTime = new Date(article.discoveredAt).getTime();
        if (!isNaN(discoveredTime)) {
          // Guardrail: never include articles discovered too long ago
          if (discoveredTime < maxAgeCutoff) return false;
          // Check if discovered within week window (strict, not soft)
          if (discoveredTime >= weekStart && discoveredTime <= weekEnd) {
            // Set published_at to discoveredAt for consistency
            article.published_at = article.discoveredAt;
            article.usedDiscoveredAtFallback = true;
            return true;
          }
        }
      }
      
      return false;
    } else {
      // Strict week-window logic for RSS/page articles (unchanged)
      if (!article.published_at) return false;
      const dt = new Date(article.published_at);
      if (isNaN(dt.getTime())) return false;
      const t = dt.getTime();
      return t >= weekStart && t <= weekEnd;
    }
  });
  
  // Classify articles and group by topic
  const byTopic: Record<Topic, Article[]> = {
    "AI_and_Strategy": [],
    "Ecommerce_Retail_Tech": [],
    "Luxury_and_Consumer": [],
    "Jewellery_Industry": [],
  };
  
  // Reset classification stats
  resetClassificationStats();
  
  // Reset rerank stats
  resetRerankStats();
  
  // Classify articles using LLM with fallback
  // Process in batches to avoid overwhelming the API, but await all results
  const classificationPromises = eligibleArticles.map(async (article) => {
    const result = await classifyArticleLLM(article);
    return { article, result };
  });
  
  const classificationResults = await Promise.all(classificationPromises);
  
  // Group articles by topic
  for (const { article, result } of classificationResults) {
    byTopic[result.category].push(article);
  }
  
  // Log classification statistics
  const classificationStats = getClassificationStats();
  console.log(`[Classification Stats] Total: ${classificationStats.total}, Cache hits: ${classificationStats.cache_hits}, Cache misses: ${classificationStats.cache_misses}, LLM calls: ${classificationStats.llm_calls}, LLM successes: ${classificationStats.llm_successes}, LLM failures: ${classificationStats.llm_failures}, Fallbacks: ${classificationStats.fallbacks}`);
  
  // Deduplicate articles within each topic
  for (const topicKey of Object.keys(byTopic) as Topic[]) {
    byTopic[topicKey] = dedupeArticles(byTopic[topicKey]);
  }
  
  // Build totals (after deduplication)
  const totals = {
    total: eligibleArticles.length,
    byTopic: {
      AIStrategy: byTopic["AI_and_Strategy"].length,
      EcommerceRetail: byTopic["Ecommerce_Retail_Tech"].length,
      LuxuryConsumer: byTopic["Luxury_and_Consumer"].length,
      Jewellery: byTopic["Jewellery_Industry"].length,
    },
  };
  
  // Build topics structure with top N articles (with relevance scores and LLM reranking)
  const topics = {
    AI_and_Strategy: {
      total: byTopic["AI_and_Strategy"].length,
      top: await selectTopN(byTopic["AI_and_Strategy"], TOP_N, "AI_and_Strategy", weekStart, weekEnd, weekLabel),
    },
    Ecommerce_Retail_Tech: {
      total: byTopic["Ecommerce_Retail_Tech"].length,
      top: await selectTopN(byTopic["Ecommerce_Retail_Tech"], TOP_N, "Ecommerce_Retail_Tech", weekStart, weekEnd, weekLabel),
    },
    Luxury_and_Consumer: {
      total: byTopic["Luxury_and_Consumer"].length,
      top: await selectTopN(byTopic["Luxury_and_Consumer"], TOP_N, "Luxury_and_Consumer", weekStart, weekEnd, weekLabel),
    },
    Jewellery_Industry: {
      total: byTopic["Jewellery_Industry"].length,
      top: await selectTopN(byTopic["Jewellery_Industry"], TOP_N, "Jewellery_Industry", weekStart, weekEnd, weekLabel),
    },
  };
  
  // Log rerank statistics (per-category + summary)
  const rerankStats = getRerankStats();
  console.log(`[Rerank Stats] Per-category:`);
  for (const catStat of rerankStats.category_stats) {
    let status: string;
    if (catStat.skipped) {
      status = `SKIPPED: ${catStat.skip_reason}`;
    } else if (catStat.cache_hit) {
      status = 'CACHE_HIT';
    } else {
      // Check if it was a fallback
      const wasFallback = catStat.skip_reason && catStat.skip_reason.includes('fallback');
      status = wasFallback ? 'FALLBACK' : 'LLM_CALL';
    }
    console.log(`  ${catStat.category}: ${catStat.total_available} available, ${catStat.candidates_count} candidates, ${catStat.selected_count} selected [${status}]`);
  }
  const avgCandidates = rerankStats.category_stats.length > 0
    ? (rerankStats.total_candidates / rerankStats.category_stats.length).toFixed(1)
    : '0';
  console.log(`[Rerank Stats] Summary: Calls: ${rerankStats.calls}, Cache hits: ${rerankStats.cache_hits}, Cache misses: ${rerankStats.cache_misses}, Fallbacks: ${rerankStats.fallbacks}, Avg candidates: ${avgCandidates}`);
  
  // Get current timestamp in Europe/Copenhagen
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const builtAtISO = now.toISO();
  const builtAtLocal = now.toFormat('yyyy-MM-dd HH:mm:ss');

  // Cover image fields will be set by the main build script after image generation
  // Default to placeholder if generation fails
  const coverImageUrl = `/weekly-images/placeholder.svg`;
  const coverImageAlt = `Weekly digest cover for ${weekLabel}`;
  const coverKeywords: string[] = [];

  return {
    weekLabel,
    tz: "Europe/Copenhagen",
    startISO,
    endISO,
    builtAtISO: builtAtISO || undefined,
    builtAtLocal,
    coverImageUrl,
    coverImageAlt,
    coverKeywords,
    totals,
    topics,
  };
}

