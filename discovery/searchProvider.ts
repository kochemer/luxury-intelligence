import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import type { Topic } from '../classification/classifyTopics';
import { CONSULTANCY_DOMAINS, isConsultancyDomain } from './consultancyDomains';

const TAVILY_API_URL = 'https://api.tavily.com/search';

export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
  score?: number;
  topic: Topic;
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

async function searchTavily(query: string, maxResults: number = 20, targetDomains?: string[]): Promise<SearchResult[]> {
  const apiKey = getTavilyApiKey();

  // Extract domain from site: operator if present
  let includeDomains: string[] = [];
  let cleanQuery = query;
  
  if (query.includes('site:')) {
    const siteMatch = query.match(/site:([^\s]+)/);
    if (siteMatch) {
      const domain = siteMatch[1].replace(/^https?:\/\//, '').split('/')[0].replace('www.', '');
      includeDomains = [domain];
      // Remove site: operator from query (Tavily will use include_domains instead)
      cleanQuery = query.replace(/site:[^\s]+\s*/, '').trim();
    }
  }
  
  // Use provided targetDomains if available
  if (targetDomains && targetDomains.length > 0) {
    includeDomains = targetDomains;
  }

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: cleanQuery,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
        include_domains: includeDomains.length > 0 ? includeDomains : [],
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
        score: result.score,
        topic: 'AI_and_Strategy' as Topic // Placeholder, will be set by caller
      };
    });
  } catch (error: any) {
    console.error(`[Tavily] Error searching for "${query}":`, error.message);
    return [];
  }
}

export type SearchStats = Record<Topic, { 
  discovery_found: number;
  consultancy_found?: number; // Count of consultancy domain results
}>;

export type DomainBreakdown = {
  total: number;
  byDomain: Record<string, number>;
  consultancy: number;
};

export async function searchWithTavily(
  queries: Record<Topic, string[]>,
  maxCandidates: number,
  discoveryDir: string
): Promise<{ results: SearchResult[]; stats: SearchStats; domainBreakdown: DomainBreakdown }> {
  const serpResultsPath = path.join(discoveryDir, 'serp-results.json');
  
  // Check if results already exist
  try {
    const existing = JSON.parse(await fs.readFile(serpResultsPath, 'utf-8'));
    const hasTopic = Array.isArray(existing) && existing.every(item => item.topic);
    if (!hasTopic) {
      console.warn(`[Search] Cached results missing topic metadata. Rebuilding search results.`);
      throw new Error('Cached search results missing topic');
    }
    console.log(`[Search] Using cached search results from ${serpResultsPath}`);
    const cachedStats: SearchStats = {
      "AI_and_Strategy": { discovery_found: 0, consultancy_found: 0 },
      "Ecommerce_Retail_Tech": { discovery_found: 0, consultancy_found: 0 },
      "Luxury_and_Consumer": { discovery_found: 0, consultancy_found: 0 },
      "Jewellery_Industry": { discovery_found: 0, consultancy_found: 0 }
    };
    const domainBreakdown: DomainBreakdown = {
      total: 0,
      byDomain: {},
      consultancy: 0
    };
    if (Array.isArray(existing)) {
      for (const item of existing) {
        const topic = item.topic as Topic | undefined;
        if (topic && cachedStats[topic]) {
          cachedStats[topic].discovery_found += 1;
          domainBreakdown.total += 1;
          
          const domain = item.domain || '';
          domainBreakdown.byDomain[domain] = (domainBreakdown.byDomain[domain] || 0) + 1;
          
          if (isConsultancyDomain(domain)) {
            cachedStats[topic].consultancy_found = (cachedStats[topic].consultancy_found || 0) + 1;
            domainBreakdown.consultancy += 1;
          }
        }
      }
    }
    return { results: existing, stats: cachedStats, domainBreakdown };
  } catch {
    // Continue to search
  }

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();
  const stats: SearchStats = {
    "AI_and_Strategy": { discovery_found: 0, consultancy_found: 0 },
    "Ecommerce_Retail_Tech": { discovery_found: 0, consultancy_found: 0 },
    "Luxury_and_Consumer": { discovery_found: 0, consultancy_found: 0 },
    "Jewellery_Industry": { discovery_found: 0, consultancy_found: 0 }
  };
  const domainBreakdown: DomainBreakdown = {
    total: 0,
    byDomain: {},
    consultancy: 0
  };

  // Search for each query
  for (const [topic, topicQueries] of Object.entries(queries)) {
    console.log(`[Search] Searching ${topicQueries.length} queries for ${topic}...`);
    
    for (const query of topicQueries) {
      // Extract domain from site: operator for Tavily include_domains
      let targetDomains: string[] | undefined;
      if (query.includes('site:')) {
        const siteMatch = query.match(/site:([^\s]+)/);
        if (siteMatch) {
          const domain = siteMatch[1].replace(/^https?:\/\//, '').split('/')[0].replace('www.', '');
          targetDomains = [domain];
        }
      }
      
      const results = await searchTavily(query, Math.ceil(maxCandidates / topicQueries.length), targetDomains);
      
      for (const result of results) {
        // Deduplicate by URL
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push({ ...result, topic: topic as Topic });
          stats[topic as Topic].discovery_found += 1;
          domainBreakdown.total += 1;
          
          // Track domain breakdown
          const domain = result.domain || '';
          domainBreakdown.byDomain[domain] = (domainBreakdown.byDomain[domain] || 0) + 1;
          
          // Track consultancy domains
          if (isConsultancyDomain(domain)) {
            stats[topic as Topic].consultancy_found = (stats[topic as Topic].consultancy_found || 0) + 1;
            domainBreakdown.consultancy += 1;
          }
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

  // Log domain breakdown
  console.log(`\n=== DOMAIN BREAKDOWN ===`);
  console.log(`Total candidates: ${domainBreakdown.total}`);
  console.log(`Consultancy domains: ${domainBreakdown.consultancy}`);
  if (domainBreakdown.consultancy > 0) {
    console.log(`\nTop consultancy domains:`);
    const consultancyDomains = Object.entries(domainBreakdown.byDomain)
      .filter(([domain]) => isConsultancyDomain(domain))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [domain, count] of consultancyDomains) {
      console.log(`  ${domain}: ${count}`);
    }
  }
  console.log(`\nTop domains overall:`);
  const topDomains = Object.entries(domainBreakdown.byDomain)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [domain, count] of topDomains) {
    console.log(`  ${domain}: ${count}`);
  }

  return { results: limitedResults, stats, domainBreakdown };
}

