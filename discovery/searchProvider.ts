import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import type { Topic } from '../classification/classifyTopics';

const TAVILY_API_URL = 'https://api.tavily.com/search';

export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
  score?: number;
};

type TavilyResponse = {
  query: string;
  response_time: number;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
    raw_content?: string;
  }>;
};

function getTavilyApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error('TAVILY_API_KEY not found in environment variables');
  }
  return key;
}

async function searchTavily(query: string, maxResults: number = 20): Promise<SearchResult[]> {
  const apiKey = getTavilyApiKey();

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
        include_domains: [],
        exclude_domains: [],
        max_results: maxResults,
        include_images: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as TavilyResponse;
    
    return data.results.map(result => {
      const urlObj = new URL(result.url);
      return {
        url: result.url,
        title: result.title,
        snippet: result.content.substring(0, 300), // Limit snippet length
        domain: urlObj.hostname.replace('www.', ''),
        publishedDate: result.published_date,
        score: result.score
      };
    });
  } catch (error: any) {
    console.error(`[Tavily] Error searching for "${query}":`, error.message);
    return [];
  }
}

export async function searchWithTavily(
  queries: Record<Topic, string[]>,
  maxCandidates: number,
  discoveryDir: string
): Promise<SearchResult[]> {
  const serpResultsPath = path.join(discoveryDir, 'serp-results.json');
  
  // Check if results already exist
  try {
    const existing = JSON.parse(await fs.readFile(serpResultsPath, 'utf-8'));
    console.log(`[Search] Using cached search results from ${serpResultsPath}`);
    return existing;
  } catch {
    // Continue to search
  }

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  // Search for each query
  for (const [topic, topicQueries] of Object.entries(queries)) {
    console.log(`[Search] Searching ${topicQueries.length} queries for ${topic}...`);
    
    for (const query of topicQueries) {
      const results = await searchTavily(query, Math.ceil(maxCandidates / topicQueries.length));
      
      for (const result of results) {
        // Deduplicate by URL
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }
      
      // Rate limiting - wait a bit between queries
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Limit to maxCandidates
  const limitedResults = allResults.slice(0, maxCandidates);

  // Save results
  await fs.mkdir(discoveryDir, { recursive: true });
  await fs.writeFile(serpResultsPath, JSON.stringify(limitedResults, null, 2), 'utf-8');

  return limitedResults;
}

