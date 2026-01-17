import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import type { Topic } from '../classification/classifyTopics';
import { getTopicDisplayName } from '../utils/topicNames';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QUERY_DELTA_MODEL = process.env.QUERY_DELTA_MODEL || 'gpt-4o';
const TEMPERATURE = 0.7;

function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }
  return key;
}

type DeltaQueriesOutput = {
  category: string;
  deltaQueries: string[];
};

function getTopicDefinition(topic: Topic): string {
  const definitions: Record<Topic, string> = {
    "AI_and_Strategy": "AI strategy, machine learning applications, AI tools, LLMs, generative AI, AI automation, AI personalization, AI-driven business strategy",
    "Ecommerce_Retail_Tech": "E-commerce platforms, retail technology, online shopping, digital commerce, retail innovation, marketplace technology, retail operations",
    "Luxury_and_Consumer": "Luxury brands, consumer goods, high-end retail, luxury market trends, premium products, luxury consumer behavior, fashion brands",
    "Jewellery_Industry": "Jewelry industry, diamonds, gemstones, luxury jewelry brands, jewelry retail, jewelry market trends, fine jewelry"
  };
  return definitions[topic];
}

function getCategoryLabel(topic: Topic): string {
  return getTopicDisplayName(topic);
}

async function getLastWeekDigest(weekLabel: string): Promise<{
  keyThemes: string[];
  topHeadlines: string[];
} | null> {
  try {
    // Parse week to get previous week
    const weekMatch = weekLabel.match(/^(\d{4})-W(\d{1,2})$/);
    if (!weekMatch) return null;
    
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
    
    // Extract top headlines (5-10) from top articles across all topics
    const topHeadlines: string[] = [];
    for (const topicKey of ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'] as Topic[]) {
      const topic = digest.topics?.[topicKey];
      if (topic?.top && Array.isArray(topic.top)) {
        for (const article of topic.top.slice(0, 3)) {
          if (article.title && topHeadlines.length < 10) {
            topHeadlines.push(article.title);
          }
        }
      }
    }
    
    return {
      keyThemes: digest.keyThemes || [],
      topHeadlines: topHeadlines.slice(0, 10)
    };
  } catch {
    return null;
  }
}

async function loadBaseQueries(): Promise<Record<string, string[]>> {
  const baseQueriesPath = path.join(__dirname, 'queries.base.json');
  try {
    const content = await fs.readFile(baseQueriesPath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    throw new Error(`Failed to load base queries: ${err.message}`);
  }
}

function computeHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

async function generateDeltaQueriesForTopic(
  topic: Topic,
  weekLabel: string,
  baseQueries: string[],
  lastWeekData: { keyThemes: string[]; topHeadlines: string[] } | null
): Promise<string[]> {
  const openai = new OpenAI({ apiKey: getOpenAIApiKey() });
  const categoryLabel = getCategoryLabel(topic);
  const topicDef = getTopicDefinition(topic);
  
  const themesContext = lastWeekData?.keyThemes && lastWeekData.keyThemes.length > 0
    ? `Last week's key themes: ${lastWeekData.keyThemes.join(', ')}`
    : 'No previous week themes available.';
  
  const headlinesContext = lastWeekData?.topHeadlines && lastWeekData.topHeadlines.length > 0
    ? `Last week's top headlines:\n${lastWeekData.topHeadlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : 'No previous week headlines available.';
  
  const baseQueriesList = baseQueries.map((q, i) => `${i + 1}. ${q}`).join('\n');
  
  const prompt = `You are a web search query generator for a weekly digest about ${categoryLabel}.

Category: ${categoryLabel}
Category definition: ${topicDef}

${themesContext}

${headlinesContext}

Base queries (already used, do NOT repeat these semantically):
${baseQueriesList}

Generate exactly 3 NEW web search queries that:
1. Focus on NEW developments this week (not covered by base queries)
2. Are phrased evergreen (no dates like "October 2023", "2024", etc.)
3. Avoid war/armed conflict, culture war, election horse-race politics
4. Are specific and actionable (include company names, product names, or specific trends when relevant)
5. Target recent news and developments (last 7 days)
6. Do NOT semantically duplicate any base query above

Return a JSON object:
{
  "category": "${categoryLabel}",
  "deltaQueries": ["query1", "query2", "query3"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: QUERY_DELTA_MODEL,
      messages: [
        { role: 'system', content: 'You are a precise web search query generator. Always return valid JSON with exactly 3 queries.' },
        { role: 'user', content: prompt }
      ],
      temperature: TEMPERATURE,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const output = JSON.parse(content) as DeltaQueriesOutput;
    
    // Validate
    if (!Array.isArray(output.deltaQueries) || output.deltaQueries.length !== 3) {
      throw new Error(`Invalid output: deltaQueries must be an array with exactly 3 queries, got ${output.deltaQueries?.length || 0}`);
    }
    
    // Validate each query is a non-empty string
    for (const query of output.deltaQueries) {
      if (typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Invalid output: all deltaQueries must be non-empty strings');
      }
    }

    return output.deltaQueries;
  } catch (error: any) {
    console.error(`[QueryDelta] Error generating delta queries for ${topic}:`, error.message);
    throw error;
  }
}

export type QueryDeltaConfig = {
  regenDelta: boolean;
  noDelta: boolean;
};

export async function generateDeltaQueries(
  weekLabel: string,
  discoveryDir: string,
  config: QueryDeltaConfig
): Promise<Record<Topic, string[]>> {
  const deltaPath = path.join(discoveryDir, 'delta-queries.json');
  
  // Load base queries
  const baseQueries = await loadBaseQueries();
  
  // Compute hash of base queries for cache validation
  const baseQueriesHash = computeHash(JSON.stringify(baseQueries));
  
  // Check if delta queries already exist and should be reused
  if (!config.regenDelta && !config.noDelta) {
    try {
      const existing = JSON.parse(await fs.readFile(deltaPath, 'utf-8'));
      if (existing.baseQueriesHash === baseQueriesHash) {
        console.log(`[QueryDelta] Using cached delta queries from ${deltaPath}`);
        const result: Record<Topic, string[]> = {
          "AI_and_Strategy": [],
          "Ecommerce_Retail_Tech": [],
          "Luxury_and_Consumer": [],
          "Jewellery_Industry": []
        };
        // Backward compatibility: support both old and new category names
        const categoryToTopic: Record<string, Topic> = {
          "AI & Strategy": "AI_and_Strategy",
          "Artificial Intelligence News": "AI_and_Strategy",
          "Ecommerce & Retail Tech": "Ecommerce_Retail_Tech",
          "Luxury & Consumer": "Luxury_and_Consumer",
          "Fashion & Luxury": "Luxury_and_Consumer",
          "Jewellery Industry": "Jewellery_Industry"
        };
        for (const [category, queries] of Object.entries(existing.deltaQueries || {})) {
          const topic = categoryToTopic[category] as Topic | undefined;
          if (topic && Array.isArray(queries)) {
            result[topic] = queries;
          }
        }
        return result;
      } else {
        console.log(`[QueryDelta] Base queries changed (hash mismatch), regenerating delta queries`);
      }
    } catch {
      // Continue to generate
    }
  }
  
  if (config.noDelta) {
    console.log(`[QueryDelta] --noDelta flag set, skipping delta query generation`);
    const empty: Record<Topic, string[]> = {
      "AI_and_Strategy": [],
      "Ecommerce_Retail_Tech": [],
      "Luxury_and_Consumer": [],
      "Jewellery_Industry": []
    };
    return empty;
  }
  
  // Get last week's data
  const lastWeekData = await getLastWeekDigest(weekLabel);
  
  const topics: Topic[] = [
    "AI_and_Strategy",
    "Ecommerce_Retail_Tech",
    "Luxury_and_Consumer",
    "Jewellery_Industry"
  ];
  
  const allDeltaQueries: Record<Topic, string[]> = {
    "AI_and_Strategy": [],
    "Ecommerce_Retail_Tech": [],
    "Luxury_and_Consumer": [],
    "Jewellery_Industry": []
  };
  
  for (const topic of topics) {
    const categoryLabel = getCategoryLabel(topic);
    const baseQueriesForTopic = baseQueries[categoryLabel] || [];
    
    if (baseQueriesForTopic.length !== 12) {
      throw new Error(`Base queries for ${categoryLabel} must have exactly 12 queries, found ${baseQueriesForTopic.length}`);
    }
    
    console.log(`[QueryDelta] Generating 3 delta queries for ${categoryLabel}...`);
    const deltaQueries = await generateDeltaQueriesForTopic(
      topic,
      weekLabel,
      baseQueriesForTopic,
      lastWeekData
    );
    allDeltaQueries[topic] = deltaQueries;
  }
  
  // Save delta queries with hash
  await fs.mkdir(discoveryDir, { recursive: true });
  const deltaOutput: Record<string, string[]> = {};
  for (const [topic, queries] of Object.entries(allDeltaQueries)) {
    const categoryLabel = getCategoryLabel(topic as Topic);
    deltaOutput[categoryLabel] = queries;
  }
  
  await fs.writeFile(deltaPath, JSON.stringify({
    weekLabel,
    baseQueriesHash,
    deltaQueries: deltaOutput,
    generatedAt: new Date().toISOString()
  }, null, 2), 'utf-8');
  
  return allDeltaQueries;
}
