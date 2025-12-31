import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { getMonthRangeCET } from '../utils/monthCET.js';
import { classifyTopic } from '../classification/classifyTopics.js';
import type { Article } from '../ingestion/types.js';
import type { Topic } from '../classification/classifyTopics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOP_N = 7;

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
 * Sort and pick top N for a topic: 
 * 1. Newer published_at (descending)
 * 2. Shorter title (ascending)
 * 3. URL (ascending)
 */
function selectTopN(articles: Article[], n: number): Article[] {
  return articles
    .slice()
    .sort((a, b) => {
      const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
      const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      if (a.title.length !== b.title.length) return a.title.length - b.title.length;
      return a.url.localeCompare(b.url);
    })
    .slice(0, n);
}

export type MonthlyDigest = {
  monthLabel: string;
  tz: string;
  startISO: string;
  endISO: string;
  builtAtISO?: string;
  builtAtLocal?: string;
  totals: {
    total: number;
    byTopic: {
      Jewellery: number;
      Ecommerce: number;
      AIStrategy: number;
      Luxury: number;
    };
  };
  topics: {
    JewelleryIndustry: { total: number; top: Article[] };
    EcommerceTechnology: { total: number; top: Article[] };
    AIEcommerceStrategy: { total: number; top: Article[] };
    LuxuryConsumerBehaviour: { total: number; top: Article[] };
  };
};

/**
 * Builds a monthly digest from articles in data/articles.json
 * @param monthLabel - Month in format "YYYY-MM" (e.g. "2025-12")
 * @returns Monthly digest object with totals and topic breakdowns
 */
export async function buildMonthlyDigest(monthLabel: string): Promise<MonthlyDigest> {
  // Parse monthLabel to create a Date (use first day of month)
  const [year, month] = monthLabel.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Invalid monthLabel format: ${monthLabel}. Expected "YYYY-MM"`);
  }
  
  // Create a date in the middle of the month to get the full month range
  const monthDate = new Date(year, month - 1, 15);
  const { monthStartCET, monthEndCET } = getMonthRangeCET(monthDate);
  
  const startISO = monthStartCET.toISOString();
  const endISO = monthEndCET.toISOString();
  
  // Load articles
  const dataPath = path.join(__dirname, '../data/articles.json');
  let articles: Article[] = [];
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    articles = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to read articles.json: ${(err as Error).message}`);
  }
  
  // Filter articles to the month window (exclude those without published_at)
  const monthStart = monthStartCET.getTime();
  const monthEnd = monthEndCET.getTime();
  
  const eligibleArticles = articles.filter(article => {
    if (!article.published_at) return false;
    const dt = new Date(article.published_at);
    if (isNaN(dt.getTime())) return false;
    const t = dt.getTime();
    return t >= monthStart && t <= monthEnd;
  });
  
  // Classify articles and group by topic
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
  
  // Deduplicate articles within each topic
  for (const topicKey of Object.keys(byTopic) as Topic[]) {
    byTopic[topicKey] = dedupeArticles(byTopic[topicKey]);
  }
  
  // Build totals (after deduplication)
  const totals = {
    total: eligibleArticles.length,
    byTopic: {
      Jewellery: byTopic["Jewellery Industry"].length,
      Ecommerce: byTopic["Ecommerce Technology"].length,
      AIStrategy: byTopic["AI & Ecommerce Strategy"].length,
      Luxury: byTopic["Luxury Consumer Behaviour"].length,
    },
  };
  
  // Build topics structure with top N articles
  const topics = {
    JewelleryIndustry: {
      total: byTopic["Jewellery Industry"].length,
      top: selectTopN(byTopic["Jewellery Industry"], TOP_N),
    },
    EcommerceTechnology: {
      total: byTopic["Ecommerce Technology"].length,
      top: selectTopN(byTopic["Ecommerce Technology"], TOP_N),
    },
    AIEcommerceStrategy: {
      total: byTopic["AI & Ecommerce Strategy"].length,
      top: selectTopN(byTopic["AI & Ecommerce Strategy"], TOP_N),
    },
    LuxuryConsumerBehaviour: {
      total: byTopic["Luxury Consumer Behaviour"].length,
      top: selectTopN(byTopic["Luxury Consumer Behaviour"], TOP_N),
    },
  };
  
  // Get current timestamp in Europe/Copenhagen
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const builtAtISO = now.toISO();
  const builtAtLocal = now.toFormat('yyyy-MM-dd HH:mm:ss');

  return {
    monthLabel,
    tz: "Europe/Copenhagen",
    startISO,
    endISO,
    builtAtISO: builtAtISO || undefined,
    builtAtLocal,
    totals,
    topics,
  };
}

