/**
 * @module classifyTopics
 *
 * Assigns each article to one of four topics using a two-stage heuristic:
 *
 * **Stage 1 — Source override** (highest priority, applied in this order):
 * 1. Jewellery Industry — exact/partial source-name match against `JEWELLERY_SOURCES`
 *    or any source that contains a `JEWELLERY_SOURCE_PATTERNS` substring.
 * 2. Ecommerce & Retail Tech — same approach with `RETAIL_COMMERCE_SOURCES`.
 * 3. Luxury & Consumer — same approach with `FASHION_LUXURY_SOURCES`.
 *
 * **Stage 2 — Keyword matching** (fallback, tested in priority order):
 * 1. AI & Strategy  — matched against title + source.
 * 2. Ecommerce & Retail Tech — matched against title + summary; blocked when
 *    `LOW_SIGNAL_NEGATIVE` markers are present unless `EXCEPTION_POSITIVE`
 *    execution-focused markers override.
 * 3. Luxury & Consumer — matched against title + source.
 * 4. Jewellery Industry — matched against title + source.
 *
 * If no keyword matches, a broad consumer-ish fallback returns `Luxury_and_Consumer`;
 * the final default is `Ecommerce_Retail_Tech`.
 *
 * Short-keyword collision prevention: terms ≤ 3 chars ("ai", "ml", "nlp", "agi")
 * are matched with word-boundary regexes to avoid false hits inside longer words
 * (e.g. "ai" inside "sustain").
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeekRangeCET } from '../lib/utils/weekCET';
import type { Article, Topic } from '../lib/types';

// Re-export Topic for backward compatibility
export type { Topic } from '../lib/types';

// --- Topic heuristics ---

// Priority order for assignment if multiple match
// AI_and_Strategy > Ecommerce_Retail_Tech > Luxury_and_Consumer > Jewellery_Industry
const TOPIC_PRIORITY: Topic[] = [
  "AI_and_Strategy",
  "Ecommerce_Retail_Tech",
  "Luxury_and_Consumer",
  "Jewellery_Industry"
];

// Heuristic keyword lists (lowercase all for case-insensitive match)
const Jewellery_Industry_Keywords = [
  // NOTE: bare "gold" / "silver" were removed — they matched "Goldman Sachs",
  // gold/silver as commodities, and "golden", dumping finance stories into
  // Jewellery. Jewellery-specific terms + the JEWELLERY_SOURCES override cover
  // genuine jewellery stories instead.
  "jewel", "jewellery", "jewelry", "diamond", "gem", "gems",
  "fancy color", "carat", "cartier", "tiffany", "bulgari", "harry winston",
  "gemstone", "precious stone", "van cleef", "luxury watch", "horology",
  "de beers", "sotheby’s", "graff", "piaget"
];

const AI_and_Strategy_Keywords = [
  // Core AI/ML terms (must be AI-focused, not generic business terms)
  "ai", "artificial intelligence", "machine learning", "ml model", "llm", "large language model",
  "chatgpt", "gpt-", "openai", "anthropic", "claude", "gemini", "deepmind",
  "generative ai", "generative model", "foundation model", "transformer",
  "deep learning", "neural network", "neural net", "computer vision", "nlp", "natural language processing",
  "prompt engineering", "fine-tuning", "training model", "model training",
  // Research/technical terms
  "arxiv", "research paper", "benchmark", "evaluation", "sota", "state of the art",
  "multimodal", "agent", "reasoning", "inference", "compute", "gpu", "tpu",
  // AI industry/economics terms
  "ai lab", "ai company", "ai startup", "model release", "weights release", "open source model",
  "ai regulation", "ai policy", "ai safety", "alignment", "agi", "artificial general intelligence"
];

const Luxury_and_Consumer_Keywords = [
  "consumer", "behaviour", "behavior", "consumer insights", "affluent",
  "luxury shopper", "vip", "purchase intent", "brand loyalty", "spending",
  "trend", "trends", "market research", "demographic", "psychographic",
  "demand", "customer journey", "connoisseur", "collectors", "high net worth",
  "motivation", "desire", "experiential"
];

const Ecommerce_Retail_Tech_Keywords = [
  "ecommerce", "e-commerce", "online store", "webshop", "marketplace",
  "shopify", "cart", "checkout", "payment", "digital storefront", "dropshipping",
  "conversion", "fulfillment", "shipment", "online retail", "cross-border",
  "platform", "magento", "bigcommerce", "shop system", "omnichannel", "logistics",
  "commerce cloud", "woocommerce"
];

// Low-signal negative markers for Ecommerce_Retail_Tech classification
const LOW_SIGNAL_NEGATIVE = [
  "sponsored",
  "advertorial",
  "press release",
  "paid content",
  "partner content"
];

// Exception-positive markers that override low-signal negative markers
// (indicates execution-focused content even if sponsored)
const EXCEPTION_POSITIVE = [
  "checkout",
  "payment",
  "fraud",
  "fulfillment",
  "returns",
  "inventory",
  "warehouse",
  "logistics",
  "conversion",
  "cart",
  "pricing",
  "promotion"
];

// Source name matches for obvious routing
// Specific jewellery sources that should be automatically classified as Jewellery_Industry
const JEWELLERY_SOURCES = [
  "Rapaport", "National Jeweler", "JCK", "Jeweller Magazine", "Professional Jeweller", "JewelleryNet"
];

// Generic patterns that indicate jewellery sources (case-insensitive partial match)
const JEWELLERY_SOURCE_PATTERNS = [
  "jeweller", "jewellery", "jewelry", "jeweler"
];

// Source name matches for obvious routing to Ecommerce_Retail_Tech
// Specific retail/commerce sources that should be automatically classified as Ecommerce_Retail_Tech
const RETAIL_COMMERCE_SOURCES = [
  "Digital Commerce 360", "Retail TouchPoints", "Modern Retail", "Practical Ecommerce", 
  "Retail Dive", "Internet Retailing", "Retail Wire", "Chain Store Age"
];

// Generic patterns that indicate retail/commerce/ecommerce sources (case-insensitive partial match)
const RETAIL_COMMERCE_SOURCE_PATTERNS = [
  "retail", "commerce", "ecommerce", "e-commerce", "retailer"
];

// Source name matches for obvious routing to Luxury_and_Consumer
// Specific fashion/luxury sources that should be automatically classified as Luxury_and_Consumer
const FASHION_LUXURY_SOURCES = [
  "Business of Fashion", "Vogue", "WWD", "Women's Wear Daily", "The Business of Fashion",
  "Luxury Daily", "Luxury Society", "Robb Report"
];

// Generic patterns that indicate fashion/luxury sources (case-insensitive partial match)
const FASHION_LUXURY_SOURCE_PATTERNS = [
  "fashion", "luxury", "vogue", "wwd", "couture"
];

/**
 * Returns true if any keyword in `keywords` appears in `text` (case-insensitive).
 *
 * For keywords ≤ 3 characters (and the explicit acronyms "ai", "ml", "nlp",
 * "agi"), a word-boundary regex is used to prevent substring false positives.
 * For example, `"ai"` would match inside `"gain"` or `"sustain"` without this
 * guard. The regex also allows a trailing hyphen (`AI-powered`, `AI-driven`).
 *
 * Longer keywords use simple `String.includes()` for performance.
 */
// Short or collision-prone keywords that must match as whole words, not
// substrings. Without this, e.g. "cart" (ecommerce) matches inside "Cartier"
// (a jewellery brand) and "ai" matches inside "sustain".
const WORD_BOUNDARY_KEYWORDS = new Set(["ai", "ml", "nlp", "agi", "cart"]);

function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => {
    const lowerKw = kw.toLowerCase();
    // For short keywords (<= 3 chars) or known collision-prone terms, use word
    // boundaries. Also handle a trailing hyphen (e.g. "AI-powered").
    if (lowerKw.length <= 3 || WORD_BOUNDARY_KEYWORDS.has(lowerKw)) {
      // Use word boundary regex: \b for word boundaries, also allow "-" after (for "AI-powered", "AI-driven", etc.)
      const escapedKw = lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedKw}(-|\\b)`, 'i');
      return pattern.test(lower);
    }
    // For longer keywords, use simple substring matching
    return lower.includes(lowerKw);
  });
}

/**
 * Classifies a single article into one of the four topics.
 *
 * See the module-level doc for the full two-stage algorithm. The key
 * design decisions:
 * - Source overrides are intentionally checked before keywords because a known
 *   specialist source (e.g. "National Jeweler") is a stronger signal than any
 *   keyword match.
 * - Ecommerce uses title + summary (not source) for keyword matching because
 *   many cross-topic sources (Forbes, Bloomberg) cover commerce stories.
 * - The `LOW_SIGNAL_NEGATIVE` / `EXCEPTION_POSITIVE` filter prevents sponsored
 *   listicles from flooding the Ecommerce bucket.
 */
export function classifyTopic(article: {
  title: string;
  url: string;
  source: string;
  snippet?: string;
  summary?: string;
  oneSentenceSummary?: string;
}): Topic | null {
  // For Ecommerce_Retail_Tech: use title + summary (not source)
  // For other categories: keep existing behavior (title + source)
  const titleAndSource = `${article.title} ${article.source}`.toLowerCase();
  const titleAndSummary = `${article.title} ${article.oneSentenceSummary || article.summary || article.snippet || ''}`.toLowerCase();
  
  // Check Jewellery Industry FIRST - source override takes absolute precedence
  // Any article from a jewellery source is automatically classified as Jewellery_Industry
  // First check exact/partial matches in JEWELLERY_SOURCES
  if (JEWELLERY_SOURCES.some(s => 
    article.source && article.source.toLowerCase().includes(s.toLowerCase())
  )) {
    return "Jewellery_Industry";
  }
  // Then check for generic jewellery source patterns (any source containing "jeweller", "jewellery", "jewelry", "jeweler")
  if (article.source && JEWELLERY_SOURCE_PATTERNS.some(pattern => 
    article.source.toLowerCase().includes(pattern.toLowerCase())
  )) {
    return "Jewellery_Industry";
  }
  
  // Check Ecommerce & Retail Tech SECOND - source override takes precedence over keyword matching
  // Any article from a retail/commerce/ecommerce source is automatically classified as Ecommerce_Retail_Tech
  // First check exact/partial matches in RETAIL_COMMERCE_SOURCES
  if (RETAIL_COMMERCE_SOURCES.some(s => 
    article.source && article.source.toLowerCase().includes(s.toLowerCase())
  )) {
    return "Ecommerce_Retail_Tech";
  }
  // Then check for generic retail/commerce source patterns (any source containing "retail", "commerce", "ecommerce", etc.)
  if (article.source && RETAIL_COMMERCE_SOURCE_PATTERNS.some(pattern => 
    article.source.toLowerCase().includes(pattern.toLowerCase())
  )) {
    return "Ecommerce_Retail_Tech";
  }
  
  // Check Luxury & Consumer THIRD - source override takes precedence over keyword matching
  // Any article from a fashion/luxury source is automatically classified as Luxury_and_Consumer
  // First check exact/partial matches in FASHION_LUXURY_SOURCES
  if (FASHION_LUXURY_SOURCES.some(s => 
    article.source && article.source.toLowerCase().includes(s.toLowerCase())
  )) {
    return "Luxury_and_Consumer";
  }
  // Then check for generic fashion/luxury source patterns (any source containing "fashion", "luxury", "vogue", etc.)
  if (article.source && FASHION_LUXURY_SOURCE_PATTERNS.some(pattern => 
    article.source.toLowerCase().includes(pattern.toLowerCase())
  )) {
    return "Luxury_and_Consumer";
  }
  
  // Collect all matching topics (in priority order)
  const matches: Topic[] = [];
  
  // Check AI & Strategy first (highest priority)
  if (matchesAnyKeyword(titleAndSource, AI_and_Strategy_Keywords)) {
    matches.push("AI_and_Strategy");
  }
  
  // Check Ecommerce & Retail Tech (use title + summary, not source)
  // Apply negative filter: block if low-signal AND no execution markers
  let shouldBlockEcommerce = false;
  if (matchesAnyKeyword(titleAndSummary, LOW_SIGNAL_NEGATIVE)) {
    // Check if exception-positive markers are present
    const hasExceptionMarker = matchesAnyKeyword(titleAndSummary, EXCEPTION_POSITIVE);
    if (!hasExceptionMarker) {
      shouldBlockEcommerce = true;
    }
  }
  
  if (!shouldBlockEcommerce && matchesAnyKeyword(titleAndSummary, Ecommerce_Retail_Tech_Keywords)) {
    matches.push("Ecommerce_Retail_Tech");
  }
  
  // Check Luxury & Consumer
  if (matchesAnyKeyword(titleAndSource, Luxury_and_Consumer_Keywords)) {
    matches.push("Luxury_and_Consumer");
  }
  
  // Check Jewellery Industry keywords (if not already matched by source)
  if (matchesAnyKeyword(titleAndSource, Jewellery_Industry_Keywords)) {
    matches.push("Jewellery_Industry");
  }

  // Return first match in priority order (AI_and_Strategy > Ecommerce_Retail_Tech > Luxury_and_Consumer > Jewellery_Industry)
  for (const priorityTopic of TOPIC_PRIORITY) {
    if (matches.includes(priorityTopic)) {
      return priorityTopic;
    }
  }

  // No topical signal from source or keywords → the article does not belong to
  // any of the four topics. Return null so callers DROP it, rather than dumping
  // every unmatched article into Ecommerce (which previously flooded that pool
  // with off-topic content — e.g. ~1,200 Dezeen architecture articles). A broad
  // "consumer-ish" catch (buy/trend/retail → Luxury) was also removed for the
  // same reason: it captured noise, not signal.
  return null;
}

// --- CET week filtering and classification ---

async function getArticlesPath(): Promise<string> {
  // __dirname isn't allowed; use import.meta.url to get path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, "../data/articles.json");
}

/**
 * Reads `data/articles.json`, filters to the current CET calendar week, and
 * classifies each eligible article using `classifyTopic`.
 *
 * @param inputDate - Reference date for week calculation (defaults to `new Date()`).
 * @returns Week label (e.g. `"2025-W04"`) and articles grouped by topic.
 */
export async function classifyCurrentWeekArticles(
  inputDate?: Date
): Promise<{ weekLabel: string; byTopic: Record<Topic, Article[]> }> {
  const dataPath = await getArticlesPath();

  // Filter-to-CET-week logic uses getWeekRangeCET
  const { weekStartCET, weekEndCET, weekLabel } = getWeekRangeCET(inputDate ?? new Date());

  let articles: Article[] = [];
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    articles = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read articles.json:', (err as Error).message);
    return { weekLabel: weekLabel, byTopic: {
      "AI_and_Strategy": [],
      "Ecommerce_Retail_Tech": [],
      "Luxury_and_Consumer": [],
      "Jewellery_Industry": [],
    }};
  }

  const weekStart = weekStartCET.getTime();
  const weekEnd = weekEndCET.getTime();

  // Only consider articles whose published_at falls in CET week span
  const eligibleArticles = articles.filter(article => {
    if (!article.published_at) return false;
    const dt = new Date(article.published_at);
    if (isNaN(dt.getTime())) return false;
    const t = dt.getTime();
    return t >= weekStart && t <= weekEnd;
  });

  // Group articles by topic
  const byTopic: Record<Topic, Article[]> = {
    "AI_and_Strategy": [],
    "Ecommerce_Retail_Tech": [],
    "Luxury_and_Consumer": [],
    "Jewellery_Industry": [],
  };

  for (const article of eligibleArticles) {
    const topic = classifyTopic(article);
    if (topic) byTopic[topic].push(article); // null = off-topic, dropped
  }

  return { weekLabel: weekLabel, byTopic };
}

// --- CLI runner ---

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.includes('classifyTopics.ts')) {
  classifyCurrentWeekArticles()
    .then(({ weekLabel, byTopic }) => {
      console.log(weekLabel);
      for (const topic of TOPIC_PRIORITY) {
        const count = byTopic[topic].length;
        console.log(`${topic}: ${count}`);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Classification failed:', err);
      process.exit(1);
    });
}

