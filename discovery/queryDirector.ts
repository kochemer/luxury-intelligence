import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import type { Topic } from '../classification/classifyTopics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUERY_DIRECTOR_MODEL = process.env.QUERY_DIRECTOR_MODEL || 'gpt-4o';
const TEMPERATURE = 0.7;

function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }
  return key;
}

type QueryDirectorOutput = {
  queries: string[];
  reasoning: string;
};

type CacheEntry = {
  output: QueryDirectorOutput;
  cached_at: string;
  weekLabel: string;
};

type QueryDirectorCache = {
  [cacheKey: string]: CacheEntry;
};

const CACHE_FILE = path.join(__dirname, '../data/query_director_cache.json');

async function loadCache(): Promise<QueryDirectorCache> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    console.warn(`[QueryDirector] Failed to load cache: ${err.message}`);
    return {};
  }
}

async function saveCache(cache: QueryDirectorCache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`[QueryDirector] Failed to save cache: ${err.message}`);
  }
}

function getCacheKey(weekLabel: string, topic: Topic, lastWeekThemes?: string[]): string {
  const themesStr = lastWeekThemes ? lastWeekThemes.sort().join('|') : '';
  return `${weekLabel}|${topic}|${themesStr}`;
}

async function getLastWeekThemes(weekLabel: string): Promise<string[]> {
  try {
    // Parse week to get previous week
    const weekMatch = weekLabel.match(/^(\d{4})-W(\d{1,2})$/);
    if (!weekMatch) return [];
    
    const year = parseInt(weekMatch[1], 10);
    const weekNumber = parseInt(weekMatch[2], 10);
    
    // Get previous week
    let prevYear = year;
    let prevWeek = weekNumber - 1;
    if (prevWeek < 1) {
      prevYear = year - 1;
      prevWeek = 52; // Approximate
    }
    
    const prevWeekLabel = `${prevYear}-W${prevWeek.toString().padStart(2, '0')}`;
    const digestPath = path.join(__dirname, '../data/digests', `${prevWeekLabel}.json`);
    const digest = JSON.parse(await fs.readFile(digestPath, 'utf-8'));
    return digest.keyThemes || [];
  } catch {
    return [];
  }
}

function getTopicDefinition(topic: Topic): string {
  const definitions: Record<Topic, string> = {
    "AI_and_Strategy": "AI strategy, machine learning applications, AI tools, LLMs, generative AI, AI automation, AI personalization, AI-driven business strategy",
    "Ecommerce_Retail_Tech": "E-commerce platforms, retail technology, online shopping, digital commerce, retail innovation, marketplace technology, retail operations",
    "Luxury_and_Consumer": "Luxury brands, consumer goods, high-end retail, luxury market trends, premium products, luxury consumer behavior",
    "Jewellery_Industry": "Jewelry industry, diamonds, gemstones, luxury jewelry brands, jewelry retail, jewelry market trends, fine jewelry"
  };
  return definitions[topic];
}

function getExampleSources(topic: Topic): string[] {
  const examples: Record<Topic, string[]> = {
    "AI_and_Strategy": ["TechCrunch", "The Verge", "MIT Technology Review", "Harvard Business Review"],
    "Ecommerce_Retail_Tech": ["Retail Dive", "Modern Retail", "Internet Retailer", "Retail Wire"],
    "Luxury_and_Consumer": ["Business of Fashion", "Luxury Daily", "Jing Daily", "WWD"],
    "Jewellery_Industry": ["National Jeweler", "JCK", "Rapaport", "Professional Jeweller"]
  };
  return examples[topic];
}

async function generateQueriesForTopic(
  topic: Topic,
  weekLabel: string,
  lastWeekThemes: string[]
): Promise<QueryDirectorOutput> {
  const cache = await loadCache();
  const cacheKey = getCacheKey(weekLabel, topic, lastWeekThemes);
  
  if (cache[cacheKey]) {
    console.log(`[QueryDirector] Cache hit for ${topic}`);
    return cache[cacheKey].output;
  }

  const openai = new OpenAI({ apiKey: getOpenAIApiKey() });
  const topicDef = getTopicDefinition(topic);
  const examples = getExampleSources(topic).join(', ');
  const themesContext = lastWeekThemes.length > 0 
    ? `Last week's key themes: ${lastWeekThemes.join(', ')}. Use these as context but focus on NEW developments.`
    : '';

  const prompt = `You are a web search query generator for a weekly digest about ${topic}.

Topic focus: ${topicDef}

${themesContext}

Generate 5-10 web search queries that will discover recent articles (published in the last 7 days) relevant to this topic. 

Requirements:
- Focus on ecommerce/retail/fashion/luxury/jewellery relevance
- English language only
- Recent news and developments (last 7 days)
- Avoid generic queries - be specific
- Include company names, product names, or specific trends when relevant
- Example sources: ${examples}

Return a JSON object with:
{
  "queries": ["query1", "query2", ...],
  "reasoning": "Brief explanation of query strategy"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: QUERY_DIRECTOR_MODEL,
      messages: [
        { role: 'system', content: 'You are a precise web search query generator. Always return valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: TEMPERATURE,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const output = JSON.parse(content) as QueryDirectorOutput;
    
    // Validate
    if (!Array.isArray(output.queries) || output.queries.length === 0) {
      throw new Error('Invalid output: queries must be a non-empty array');
    }

    // Cache result
    cache[cacheKey] = {
      output,
      cached_at: new Date().toISOString(),
      weekLabel
    };
    await saveCache(cache);

    return output;
  } catch (error: any) {
    console.error(`[QueryDirector] Error generating queries for ${topic}:`, error.message);
    throw error;
  }
}

export async function generateSearchQueries(
  weekLabel: string,
  discoveryDir: string
): Promise<Record<Topic, string[]>> {
  const queriesPath = path.join(discoveryDir, 'queries.json');
  
  // Check if queries already exist
  try {
    const existing = JSON.parse(await fs.readFile(queriesPath, 'utf-8'));
    console.log(`[QueryDirector] Using cached queries from ${queriesPath}`);
    return existing;
  } catch {
    // Continue to generate
  }

  const lastWeekThemes = await getLastWeekThemes(weekLabel);
  const topics: Topic[] = [
    "AI_and_Strategy",
    "Ecommerce_Retail_Tech",
    "Luxury_and_Consumer",
    "Jewellery_Industry"
  ];

  const allQueries: Record<Topic, string[]> = {
    "AI_and_Strategy": [],
    "Ecommerce_Retail_Tech": [],
    "Luxury_and_Consumer": [],
    "Jewellery_Industry": []
  };

  for (const topic of topics) {
    console.log(`[QueryDirector] Generating queries for ${topic}...`);
    const result = await generateQueriesForTopic(topic, weekLabel, lastWeekThemes);
    allQueries[topic] = result.queries;
  }

  // Save queries
  await fs.mkdir(discoveryDir, { recursive: true });
  await fs.writeFile(queriesPath, JSON.stringify(allQueries, null, 2), 'utf-8');

  return allQueries;
}

