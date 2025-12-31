import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMonthRangeCET } from '../utils/monthCET.js';

// --- Types ---
export type Topic =
  | "Jewellery Industry"
  | "Ecommerce Technology"
  | "AI & Ecommerce Strategy"
  | "Luxury Consumer Behaviour";

export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
};

// --- Topic heuristics ---

// Priority order for assignment if multiple match
const TOPIC_PRIORITY: Topic[] = [
  "Jewellery Industry",
  "AI & Ecommerce Strategy",
  "Luxury Consumer Behaviour",
  "Ecommerce Technology"
];

// Heuristic keyword lists (lowercase all for case-insensitive match)
const JEWELLERY_KEYWORDS = [
  "jewel", "jewellery", "jewelry", "diamond", "gold", "silver", "gem", "gems",
  "fancy color", "carat", "cartier", "tiffany", "bulgari", "harry winston",
  "gemstone", "precious stone", "van cleef", "luxury watch", "horology",
  "de beers", "sotheby’s", "graff", "piaget"
];

const AI_ECOMMERCE_KEYWORDS = [
  "ai", "artificial intelligence", "machine learning", "ml model", "llm",
  "chatgpt", "gpt-", "openai", "generative", "personalization", "recommender",
  "recommendation", "predictive", "data-driven", "algorithm", "automation", 
  "data science", "computer vision", "nlp", "large language", "deep learning",
  "prompt", "foundation model"
];

const LUXURY_BEHAVIOUR_KEYWORDS = [
  "consumer", "behaviour", "behavior", "consumer insights", "affluent",
  "luxury shopper", "vip", "purchase intent", "brand loyalty", "spending",
  "trend", "trends", "market research", "demographic", "psychographic",
  "demand", "customer journey", "connoisseur", "collectors", "high net worth",
  "motivation", "desire", "experiential"
];

const ECOMMERCE_KEYWORDS = [
  "ecommerce", "e-commerce", "online store", "webshop", "marketplace",
  "shopify", "cart", "checkout", "payment", "digital storefront", "dropshipping",
  "conversion", "fulfillment", "shipment", "online retail", "cross-border",
  "platform", "magento", "bigcommerce", "shop system", "omnichannel", "logistics",
  "commerce cloud", "woocommerce"
];

// Source name matches for obvious routing
const JEWELLERY_SOURCES = [
  "Rapaport", "National Jeweler", "JCK", "Jeweller Magazine", "Professional Jeweller", "JewelleryNet"
];

// Helper: Lowercase test for any keyword present
function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

export function classifyTopic(article: { title: string; url: string; source: string }): Topic {
  // Rule: Source-based override for pure jewellery media
  if (JEWELLERY_SOURCES.some(s => 
    article.source && article.source.toLowerCase().includes(s.toLowerCase())
  )) {
    return "Jewellery Industry";
  }

  // Heuristic matching by keywords in title first (then fallback to source)
  const titleAndSource = `${article.title} ${article.source}`.toLowerCase();

  if (matchesAnyKeyword(titleAndSource, JEWELLERY_KEYWORDS)) {
    return "Jewellery Industry";
  }

  if (matchesAnyKeyword(titleAndSource, AI_ECOMMERCE_KEYWORDS)) {
    return "AI & Ecommerce Strategy";
  }

  if (matchesAnyKeyword(titleAndSource, LUXURY_BEHAVIOUR_KEYWORDS)) {
    return "Luxury Consumer Behaviour";
  }

  if (matchesAnyKeyword(titleAndSource, ECOMMERCE_KEYWORDS)) {
    return "Ecommerce Technology";
  }

  // Broad fallback: if looks consumer-ish use "Luxury Consumer Behaviour"
  const fallbackConsumerish = ["consumer", "shopper", "customer", "retail", "buy", "seller", "trend"];
  if (matchesAnyKeyword(titleAndSource, fallbackConsumerish)) {
    return "Luxury Consumer Behaviour";
  }

  // Default fallback: "Ecommerce Technology"
  return "Ecommerce Technology";
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

  // Filter-to-CET-month logic uses getMonthRangeCET
  const { monthStartCET, monthEndCET, monthLabel } = getMonthRangeCET(inputDate ?? new Date());

  let articles: Article[] = [];
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    articles = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read articles.json:', (err as Error).message);
    return { weekLabel: monthLabel, byTopic: {
      "Jewellery Industry": [],
      "Ecommerce Technology": [],
      "AI & Ecommerce Strategy": [],
      "Luxury Consumer Behaviour": [],
    }};
  }

  const monthStart = monthStartCET.getTime();
  const monthEnd = monthEndCET.getTime();

  // Only consider articles whose published_at falls in CET month span
  const eligibleArticles = articles.filter(article => {
    if (!article.published_at) return false;
    const dt = new Date(article.published_at);
    if (isNaN(dt.getTime())) return false;
    const t = dt.getTime();
    return t >= monthStart && t <= monthEnd;
  });

  // Group articles by topic
  const byTopic: Record<Topic, Article[]> = {
    "Jewellery Industry": [],
    "Ecommerce Technology": [],
    "AI & Ecommerce Strategy": [],
    "Luxury Consumer Behaviour": [],
  };

  for (const article of eligibleArticles) {
    const topic = classifyTopic(article);
    byTopic[topic].push(article);
  }

  return { weekLabel: monthLabel, byTopic };
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

