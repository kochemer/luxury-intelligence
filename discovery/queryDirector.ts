import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Topic } from '../classification/classifyTopics';
import { generateDeltaQueries, type QueryDeltaConfig } from './queryDelta';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCategoryLabel(topic: Topic): string {
  const labels: Record<Topic, string> = {
    "AI_and_Strategy": "AI & Strategy",
    "Ecommerce_Retail_Tech": "Ecommerce & Retail Tech",
    "Luxury_and_Consumer": "Luxury & Consumer",
    "Jewellery_Industry": "Jewellery Industry"
  };
  return labels[topic];
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

export type QueriesOutput = {
  baseQueries: Record<string, string[]>;
  deltaQueries: Record<string, string[]>;
  finalQueries: Record<Topic, string[]>;
  baseQueriesHash: string;
  weekLabel: string;
  generatedAt: string;
};

export async function generateSearchQueries(
  weekLabel: string,
  discoveryDir: string,
  config: QueryDeltaConfig = { regenDelta: false, noDelta: false }
): Promise<Record<Topic, string[]>> {
  const queriesPath = path.join(discoveryDir, 'queries.json');
  
  // Load base queries
  const baseQueries = await loadBaseQueries();
  const baseQueriesHash = computeHash(JSON.stringify(baseQueries));
  
  // Check if queries already exist and should be reused
  if (!config.regenDelta) {
    try {
      const existing = JSON.parse(await fs.readFile(queriesPath, 'utf-8')) as QueriesOutput;
      if (existing.baseQueriesHash === baseQueriesHash) {
        console.log(`[QueryDirector] Using cached queries from ${queriesPath}`);
        return existing.finalQueries;
      } else {
        console.log(`[QueryDirector] Base queries changed (hash mismatch), regenerating queries`);
      }
    } catch {
      // Continue to generate
    }
  }
  
  // Generate delta queries
  const deltaQueries = await generateDeltaQueries(weekLabel, discoveryDir, config);
  
  // Assemble final queries
  const topics: Topic[] = [
    "AI_and_Strategy",
    "Ecommerce_Retail_Tech",
    "Luxury_and_Consumer",
    "Jewellery_Industry"
  ];
  
  const finalQueries: Record<Topic, string[]> = {
    "AI_and_Strategy": [],
    "Ecommerce_Retail_Tech": [],
    "Luxury_and_Consumer": [],
    "Jewellery_Industry": []
  };
  
  const deltaQueriesByCategory: Record<string, string[]> = {};
  
  for (const topic of topics) {
    const categoryLabel = getCategoryLabel(topic);
    const baseQueriesForCategory = baseQueries[categoryLabel] || [];
    const deltaQueriesForTopic = deltaQueries[topic] || [];
    
    if (baseQueriesForCategory.length !== 12) {
      throw new Error(`Base queries for ${categoryLabel} must have exactly 12 queries, found ${baseQueriesForCategory.length}`);
    }
    
    const combined = [...baseQueriesForCategory, ...deltaQueriesForTopic];
    finalQueries[topic] = combined;
    deltaQueriesByCategory[categoryLabel] = deltaQueriesForTopic;
    
    const baseCount = baseQueriesForCategory.length;
    const deltaCount = deltaQueriesForTopic.length;
    const totalCount = combined.length;
    console.log(`[QueryDirector] ${categoryLabel}: base=${baseCount}, delta=${deltaCount}, total=${totalCount}`);
  }
  
  // Save queries with metadata
  const output: QueriesOutput = {
    baseQueries,
    deltaQueries: deltaQueriesByCategory,
    finalQueries,
    baseQueriesHash,
    weekLabel,
    generatedAt: new Date().toISOString()
  };
  
  await fs.mkdir(discoveryDir, { recursive: true });
  await fs.writeFile(queriesPath, JSON.stringify(output, null, 2), 'utf-8');
  
  // Print summary
  console.log('\n=== QUERY SUMMARY ===');
  for (const topic of topics) {
    const categoryLabel = getCategoryLabel(topic);
    const baseCount = baseQueries[categoryLabel]?.length || 0;
    const deltaCount = deltaQueriesByCategory[categoryLabel]?.length || 0;
    const totalCount = finalQueries[topic].length;
    console.log(`${categoryLabel}: base=${baseCount}, delta=${deltaCount}, total=${totalCount}`);
  }
  
  return finalQueries;
}

