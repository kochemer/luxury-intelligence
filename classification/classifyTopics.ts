import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeekRangeCET } from '../utils/weekCET';

// --- Types ---
export type Topic =
  | "AI_and_Strategy"
  | "Ecommerce_Retail_Tech"
  | "Luxury_and_Consumer"
  | "Jewellery_Industry";

export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
};

// --- Topic heuristics ---

// Heuristic keyword lists (lowercase all for case-insensitive match)
// Keywords should be specific enough to avoid false positives

const Jewellery_Industry_Keywords = [
  "jewel", "jewellery", "jewelry", "diamond", "gold", "silver", "gem", "gems",
  "fancy color", "carat", "cartier", "tiffany", "bulgari", "harry winston",
  "gemstone", "precious stone", "van cleef", "luxury watch", "horology",
  "de beers", "sotheby's", "graff", "piaget", "jeweler", "jeweller"
];

// Frontier AI keywords - focused on research, model development, benchmarks, not business applications
const AI_and_Strategy_Keywords = [
  // Core AI/ML terms
  "ai", "artificial intelligence", "machine learning", "ml model", "llm",
  "chatgpt", "gpt-", "openai", "generative ai", "large language model", "deep learning",
  "foundation model", "neural network", "ai model",
  // Frontier AI research terms
  "benchmark", "state of the art", "sota", "leaderboard",
  "mmlu", "gpqa", "gsm8k", "math", "humaneval", "swe-bench", "eval", "evaluation",
  "model release", "weights", "open-source model", "inference",
  "scaling law", "rlhf", "dpo", "rlaif", "alignment", "evals",
  "multimodal", "reasoning", "agent", "tool use", "planning",
  "training compute", "h100", "b200", "tpu", "datacenter", "inference cost",
  "funding", "revenue", "profit", "valuation", // LLM company financials
  "anthropic", "claude", "google deepmind", "gemini", "meta ai", "llama",
  "mistral", "cohere", "ai21", "perplexity", "xai", "grok"
];

const Luxury_and_Consumer_Keywords = [
  "luxury consumer", "consumer behaviour", "consumer behavior", "consumer insights", "affluent consumer",
  "luxury shopper", "vip customer", "purchase intent", "brand loyalty", "luxury spending",
  "luxury trend", "luxury trends", "luxury market research", "luxury demographic", "luxury psychographic",
  "luxury demand", "luxury customer journey", "connoisseur", "luxury collectors", "high net worth",
  "luxury motivation", "luxury desire", "luxury experiential", "luxury brand"
];

const Ecommerce_Retail_Tech_Keywords = [
  "ecommerce", "e-commerce", "online store", "webshop", "ecommerce marketplace",
  "shopify", "shopping cart", "checkout", "ecommerce payment", "digital storefront", "dropshipping",
  "ecommerce conversion", "order fulfillment", "ecommerce shipment", "online retail", "cross-border ecommerce",
  "ecommerce platform", "magento", "bigcommerce", "shop system", "omnichannel retail", "retail logistics",
  "commerce cloud", "woocommerce", "retail technology", "retail innovation", "retail tech"
];

// Source name matches for obvious routing
const JEWELLERY_SOURCES = [
  "Rapaport", "National Jeweler", "JCK", "Jeweller Magazine", "Professional Jeweller", "JewelleryNet", "InstoreMag"
];

// Source-based classification hints (strong indicators)
const ECOMMERCE_RETAIL_SOURCES = [
  "Retail TouchPoints", "Modern Retail", "Practical Ecommerce", "Retail"
];

const LUXURY_CONSUMER_SOURCES = [
  "BoF", "Business of Fashion", "Luxury Daily", "WWD", "FashionNetwork", "JustLuxe", "Trend Hunter"
];

const AI_STRATEGY_SOURCES = [
  "MIT Technology Review"
];

// Helper: Lowercase test for any keyword present
// Uses word boundaries for short keywords like "ai" to avoid false matches (e.g., "retail" contains "ai")
function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => {
    // For very short keywords (2-3 chars), use word boundary matching to avoid false positives
    if (kw.length <= 3) {
      // Match as whole word or with non-letter characters around it
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(lower);
    }
    // For longer keywords, simple substring match is fine
    return lower.includes(kw);
  });
}

export function classifyTopic(article: { title: string; url: string; source: string }): Topic {
  const titleAndSource = `${article.title} ${article.source}`.toLowerCase();
  const sourceLower = article.source.toLowerCase();
  
  // Source-based classification (strong indicators, checked first)
  // These take precedence over keyword matching for known sources
  if (JEWELLERY_SOURCES.some(s => sourceLower.includes(s.toLowerCase()))) {
    return "Jewellery_Industry";
  }
  
  if (ECOMMERCE_RETAIL_SOURCES.some(s => sourceLower.includes(s.toLowerCase()))) {
    // Retail/ecommerce sources default to Ecommerce_Retail_Tech
    // Only override if there's a very strong AI signal (explicit AI keywords)
    if (matchesAnyKeyword(titleAndSource, ["ai", "artificial intelligence", "machine learning", "llm", "chatgpt", "gpt-", "openai"])) {
      return "AI_and_Strategy";
    }
    return "Ecommerce_Retail_Tech";
  }
  
  if (LUXURY_CONSUMER_SOURCES.some(s => sourceLower.includes(s.toLowerCase()))) {
    // Luxury/fashion sources default to Luxury_and_Consumer
    return "Luxury_and_Consumer";
  }
  
  if (AI_STRATEGY_SOURCES.some(s => sourceLower.includes(s.toLowerCase()))) {
    // MIT Tech Review AI articles default to AI_and_Strategy
    return "AI_and_Strategy";
  }
  
  // For unknown sources, use keyword-based classification with intelligent tie-breaking
  // Count keyword matches per category to determine strongest signal
  const matchScores: Record<Topic, number> = {
    "Jewellery_Industry": 0,
    "Luxury_and_Consumer": 0,
    "Ecommerce_Retail_Tech": 0,
    "AI_and_Strategy": 0,
  };
  
  // Score matches (count keyword occurrences for stronger signals)
  const text = titleAndSource;
  const lowerText = text.toLowerCase();
  
  // Jewellery keywords (strongest signal - check first)
  for (const kw of Jewellery_Industry_Keywords) {
    if (matchesAnyKeyword(text, [kw])) {
      matchScores["Jewellery_Industry"]++;
    }
  }
  
  // Luxury/Consumer keywords
  for (const kw of Luxury_and_Consumer_Keywords) {
    if (matchesAnyKeyword(text, [kw])) {
      matchScores["Luxury_and_Consumer"]++;
    }
  }
  
  // Ecommerce/Retail keywords
  for (const kw of Ecommerce_Retail_Tech_Keywords) {
    if (matchesAnyKeyword(text, [kw])) {
      matchScores["Ecommerce_Retail_Tech"]++;
    }
  }
  
  // AI/Strategy keywords (frontier AI focus)
  for (const kw of AI_and_Strategy_Keywords) {
    if (matchesAnyKeyword(text, [kw])) {
      matchScores["AI_and_Strategy"]++;
    }
  }
  
  // Intelligent tie-breaking: prioritize strongest signal
  // If jewellery has strong match (>= 2 keywords), it wins
  if (matchScores["Jewellery_Industry"] >= 2) {
    return "Jewellery_Industry";
  }
  
  // If fashion/luxury has strong match (>= 2 keywords), it wins
  if (matchScores["Luxury_and_Consumer"] >= 2) {
    return "Luxury_and_Consumer";
  }
  
  // If ecommerce/retail has strong match (>= 2 keywords), it wins
  if (matchScores["Ecommerce_Retail_Tech"] >= 2) {
    return "Ecommerce_Retail_Tech";
  }
  
  // If AI has strong match (>= 2 keywords), it wins
  if (matchScores["AI_and_Strategy"] >= 2) {
    return "AI_and_Strategy";
  }
  
  // For single keyword matches, use specificity order (most specific first)
  // Jewellery is most specific, then luxury, then ecommerce, then AI
  if (matchScores["Jewellery_Industry"] > 0) {
    return "Jewellery_Industry";
  }
  if (matchScores["Luxury_and_Consumer"] > 0) {
    return "Luxury_and_Consumer";
  }
  if (matchScores["Ecommerce_Retail_Tech"] > 0) {
    return "Ecommerce_Retail_Tech";
  }
  if (matchScores["AI_and_Strategy"] > 0) {
    return "AI_and_Strategy";
  }
  
  // Conservative fallback: only use if there's a clear signal
  // Check for very specific luxury/consumer terms
  const specificLuxuryTerms = ["luxury", "affluent", "high-end", "premium brand", "luxury brand"];
  if (matchesAnyKeyword(titleAndSource, specificLuxuryTerms)) {
    return "Luxury_and_Consumer";
  }
  
  // Check for very specific retail/ecommerce terms
  const specificRetailTerms = ["retail innovation", "retail technology", "omnichannel retail", "online retail", "retail tech"];
  if (matchesAnyKeyword(titleAndSource, specificRetailTerms)) {
    return "Ecommerce_Retail_Tech";
  }
  
  // For Hacker News and other general tech sources: only classify if there's a signal
  if (sourceLower.includes("hacker news")) {
    // Check for any category signal
    const weakTechSignals = ["retail", "ecommerce", "shopping", "store", "merchant", "retailer"];
    if (matchesAnyKeyword(titleAndSource, weakTechSignals)) {
      return "Ecommerce_Retail_Tech";
    }
    // If no clear signal, return Ecommerce_Retail_Tech with low confidence (handled by caller)
    return "Ecommerce_Retail_Tech";
  }
  
  // For other unknown sources with no matches, return Ecommerce_Retail_Tech as fallback
  // This should be rare - most articles should match keywords or source hints
  // Note: Low confidence will be marked by the caller
  return "Ecommerce_Retail_Tech";
}

// --- CET week filtering and classification ---

async function getArticlesPath(): Promise<string> {
  // __dirname isn't allowed; use import.meta.url to get path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, "../data/articles.json");
}

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
    byTopic[topic].push(article);
  }

  return { weekLabel: weekLabel, byTopic };
}

// --- CLI runner ---

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.includes('classifyTopics.ts')) {
  classifyCurrentWeekArticles()
    .then(({ weekLabel, byTopic }) => {
      console.log(weekLabel);
      const topics: Topic[] = ["Jewellery_Industry", "Luxury_and_Consumer", "Ecommerce_Retail_Tech", "AI_and_Strategy"];
      for (const topic of topics) {
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

