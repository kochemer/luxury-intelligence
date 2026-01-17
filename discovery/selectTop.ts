import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import type { ExtractedArticle } from './fetchExtract';
import type { Topic } from '../classification/classifyTopics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SELECTION_MODEL = process.env.SELECTION_MODEL || 'gpt-4o';
const TEMPERATURE = 0.3;
const TOP_K = 40; // Number of items to rank in LLM phase
const MAX_CANDIDATES = 100; // Max candidates to send to LLM

function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }
  return key;
}

export type SelectedArticle = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
  publishedDateInvalid?: boolean;
  discoveredAt?: string;
  rank: number;
  why: string;
  confidence: number;
  category: Topic;
};

type RankedItem = {
  url: string;
  rank: number;
  why: string;
  primaryTag: string;
  insightType: string;
  controversyRisk: 'none' | 'low' | 'med' | 'high';
  confidence: number;
};

type RankingOutput = {
  ranked: RankedItem[];
};

type SelectionReport = {
  candidate_count: number;
  ranked_top_k_count: number;
  selected_count: number;
  exclusion_counts: {
    domainCap: number;
    duplicate: number;
    hardControversy: number;
    sponsored: number;
  };
  fallback_used: {
    domainCapRelaxed: boolean;
  };
};

// Hard controversy markers for deterministic exclusion
const HARD_CONTROVERSY_MARKERS = {
  war: ["war", "armed conflict", "violence", "military action", "combat", "battle", "invasion", "attack", "bombing", "drone strike"],
  cultureWar: ["culture war", "identity politics", "woke", "cancel culture", "political correctness", "gender ideology", "critical race theory"],
  election: ["election", "campaign", "polling", "voter", "candidate", "primary", "debate", "ballot", "electoral"],
};

const POLICY_ALLOWLIST = [
  "tariff", "tariffs", "trade policy", "trade war", "trade agreement",
  "regulation", "regulatory", "compliance", "AI Act", "GDPR", "privacy law",
  "data protection", "platform regulation", "antitrust", "competition law",
  "consumer protection", "retail regulation", "ecommerce regulation"
];

// Sponsored/press-release indicators
const SPONSORED_INDICATORS = [
  "sponsored", "press release", "pr newswire", "business wire", 
  "sponsored content", "advertisement", "promoted", "paid post"
];

function containsMarkers(text: string, markers: string[]): boolean {
  const lowerText = text.toLowerCase();
  return markers.some(marker => lowerText.includes(marker.toLowerCase()));
}

function containsAllowlist(text: string, allowlist: string[]): boolean {
  const lowerText = text.toLowerCase();
  return allowlist.some(term => lowerText.includes(term.toLowerCase()));
}

function isSponsored(article: ExtractedArticle): boolean {
  const text = `${article.title} ${article.snippet} ${article.extractedText}`.toLowerCase();
  return SPONSORED_INDICATORS.some(indicator => text.includes(indicator));
}

function detectHardControversy(article: ExtractedArticle): boolean {
  const text = `${article.title} ${article.snippet} ${article.extractedText}`;
  
  // Allow policy-related content even if it mentions controversy markers
  const hasPolicyContext = containsAllowlist(text, POLICY_ALLOWLIST);
  const hasWar = containsMarkers(text, HARD_CONTROVERSY_MARKERS.war);
  const hasCultureWar = containsMarkers(text, HARD_CONTROVERSY_MARKERS.cultureWar);
  const hasElection = containsMarkers(text, HARD_CONTROVERSY_MARKERS.election);
  
  // If it has policy context, allow it even if it mentions war/culture/election
  if (hasPolicyContext && (hasWar || hasCultureWar || hasElection)) {
    return false;
  }
  
  return hasWar || hasCultureWar || hasElection;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNearDuplicate(title1: string, title2: string): boolean {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  
  // Exact match
  if (norm1 === norm2) return true;
  
  // Check if one is a substring of the other (for very similar titles)
  const words1 = norm1.split(/\s+/);
  const words2 = norm2.split(/\s+/);
  
  // If titles share >80% of words, consider them duplicates
  const commonWords = words1.filter(w => words2.includes(w));
  const similarity = commonWords.length / Math.max(words1.length, words2.length);
  
  return similarity > 0.8;
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

/**
 * PHASE A: LLM RANKING PHASE
 * Ranks candidates without hard exclusions (except obvious sponsored content)
 * Returns TOP_K ranked items with controversy risk labels
 */
async function rankArticlesForTopic(
  articles: ExtractedArticle[],
  topic: Topic,
  weekLabel: string
): Promise<RankedItem[]> {
  if (articles.length === 0) return [];

  // Filter out only obvious sponsored/press-release content deterministically
  const filtered = articles.filter(article => !isSponsored(article));
  
  if (filtered.length === 0) {
    console.warn(`[Rank] No non-sponsored articles for ${topic}`);
    return [];
  }

  // Limit to reasonable batch size for LLM
  const candidates = filtered.slice(0, MAX_CANDIDATES);
  
  // Build candidate list for LLM with 400-600 char excerpts
  const candidateList = candidates.map((article, idx) => {
    const excerpt = article.extractedText.substring(0, 600);
    // Ensure excerpt is at least 400 chars if possible
    const finalExcerpt = excerpt.length < 400 && article.extractedText.length > 400
      ? article.extractedText.substring(0, 400)
      : excerpt;
    
    return {
      index: idx + 1,
      url: article.url,
      title: article.title,
      domain: article.domain,
      date: article.publishedDate || 'unknown',
      snippet: article.snippet,
      excerpt: finalExcerpt
    };
  });

  const openai = new OpenAI({ apiKey: getOpenAIApiKey() });
  const topicDef = getTopicDefinition(topic);
  const targetK = Math.min(TOP_K, candidates.length);

  const systemPrompt = `You are an article ranking assistant. Your task is to RANK articles by relevance and quality, not to filter them out. 
Always return exactly the requested number of ranked items unless fewer candidates exist.
Do not be overly conservative; prefer ranking lower rather than excluding articles.
Return valid JSON only.`;

  const userPrompt = `Rank the top ${targetK} most relevant articles for a weekly digest about ${topic}.

Topic focus: ${topicDef}

This is a RANKING task, not a strict filtering task. Rank articles by:
- Relevance to ${topic}
- Recency (prefer articles from the last 7 days)
- Quality and depth of content
- Business/industry significance
- Insight value (new information, trends, strategic implications)

IMPORTANT: Return exactly ${targetK} ranked items unless fewer than ${targetK} candidates exist.

For each article, assess controversy risk:
- "none": No controversial content
- "low": Minor political/business controversy, acceptable
- "med": Moderate controversy but relevant to business/industry
- "high": Hard controversial topics (war/armed conflict, culture war, election horse-race politics)

ALLOW articles about tariffs/trade policy, privacy/AI regulation, compliance laws that directly impact retail/ecommerce/AI.

Return a JSON object:
{
  "ranked": [
    {
      "url": "article url",
      "rank": 1,
      "why": "5-15 word explanation of relevance",
      "primaryTag": "e.g., AI, E-commerce, Retail, Strategy",
      "insightType": "e.g., Product Launch, Market Trend, Strategic Move, Industry Analysis",
      "controversyRisk": "none" | "low" | "med" | "high",
      "confidence": 0.85
    }
  ]
}

Return exactly ${targetK} items in the ranked array, ordered by rank (1 = best).`;

  try {
    const response = await openai.chat.completions.create({
      model: SELECTION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${userPrompt}\n\nCandidates:\n${JSON.stringify(candidateList, null, 2)}` }
      ],
      temperature: TEMPERATURE,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const output = JSON.parse(content) as RankingOutput;
    
    // Validate ranked items
    if (!output.ranked || !Array.isArray(output.ranked)) {
      throw new Error('Invalid ranking output: missing ranked array');
    }

    // Sort by rank to ensure proper order
    output.ranked.sort((a, b) => a.rank - b.rank);
    
    return output.ranked;
  } catch (error: any) {
    console.error(`[Rank] Error ranking articles for ${topic}:`, error.message);
    throw error;
  }
}

/**
 * PHASE B: DETERMINISTIC SELECTION PHASE
 * Takes ranked items and applies constraints to reach target count
 */
function selectFromRanked(
  ranked: RankedItem[],
  candidates: ExtractedArticle[],
  topic: Topic,
  selectTop: number
): { selected: SelectedArticle[]; report: SelectionReport } {
  const report: SelectionReport = {
    candidate_count: candidates.length,
    ranked_top_k_count: ranked.length,
    selected_count: 0,
    exclusion_counts: {
      domainCap: 0,
      duplicate: 0,
      hardControversy: 0,
      sponsored: 0
    },
    fallback_used: {
      domainCapRelaxed: false
    }
  };

  const selected: SelectedArticle[] = [];
  const domainCounts = new Map<string, number>();
  const selectedTitles: string[] = [];
  let domainCap = 2; // Start with max 2 per domain

  // First pass: apply constraints with domain cap of 2
  for (const item of ranked) {
    if (selected.length >= selectTop) break;

    const candidate = candidates.find(c => c.url === item.url);
    if (!candidate) continue;

    // Check hard controversy (deterministic)
    if (detectHardControversy(candidate)) {
      report.exclusion_counts.hardControversy++;
      continue;
    }

    // Check sponsored (should already be filtered, but double-check)
    if (isSponsored(candidate)) {
      report.exclusion_counts.sponsored++;
      continue;
    }

    // Check near-duplicates
    const isDuplicate = selectedTitles.some(selectedTitle => 
      isNearDuplicate(candidate.title, selectedTitle)
    );
    if (isDuplicate) {
      report.exclusion_counts.duplicate++;
      continue;
    }

    // Check domain cap
    const domain = candidate.domain;
    const currentCount = domainCounts.get(domain) || 0;
    if (currentCount >= domainCap) {
      report.exclusion_counts.domainCap++;
      continue;
    }

    // Add to selected
    selected.push({
      url: candidate.url,
      title: candidate.title,
      snippet: candidate.snippet,
      domain: candidate.domain,
      publishedDate: candidate.publishedDate,
      publishedDateInvalid: candidate.publishedDateInvalid,
      discoveredAt: candidate.discoveredAt,
      rank: item.rank,
      why: item.why,
      confidence: item.confidence,
      category: topic
    });

    domainCounts.set(domain, currentCount + 1);
    selectedTitles.push(candidate.title);
  }

  // If still short, relax domain cap to 3 and continue
  if (selected.length < selectTop && domainCap === 2) {
    domainCap = 3;
    report.fallback_used.domainCapRelaxed = true;
    console.log(`[Select] Relaxing domain cap to 3 to reach target count`);

    // Continue from where we left off
    for (const item of ranked) {
      if (selected.length >= selectTop) break;

      const candidate = candidates.find(c => c.url === item.url);
      if (!candidate) continue;

      // Skip if already selected
      if (selected.some(s => s.url === candidate.url)) continue;

      // Check hard controversy
      if (detectHardControversy(candidate)) continue;

      // Check sponsored
      if (isSponsored(candidate)) continue;

      // Check near-duplicates
      const isDuplicate = selectedTitles.some(selectedTitle => 
        isNearDuplicate(candidate.title, selectedTitle)
      );
      if (isDuplicate) continue;

      // Check relaxed domain cap
      const domain = candidate.domain;
      const currentCount = domainCounts.get(domain) || 0;
      if (currentCount >= domainCap) continue;

      // Add to selected
      selected.push({
        url: candidate.url,
        title: candidate.title,
        snippet: candidate.snippet,
        domain: candidate.domain,
        publishedDate: candidate.publishedDate,
        rank: item.rank,
        why: item.why,
        confidence: item.confidence,
        category: topic
      });

      domainCounts.set(domain, currentCount + 1);
      selectedTitles.push(candidate.title);
    }
  }

  report.selected_count = selected.length;
  return { selected, report };
}

async function selectArticlesForTopic(
  articles: ExtractedArticle[],
  topic: Topic,
  topN: number,
  weekLabel: string
): Promise<{ selected: SelectedArticle[]; report: SelectionReport }> {
  if (articles.length === 0) {
    return {
      selected: [],
      report: {
        candidate_count: 0,
        ranked_top_k_count: 0,
        selected_count: 0,
        exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
        fallback_used: { domainCapRelaxed: false }
      }
    };
  }

  try {
    // PHASE A: LLM Ranking
    console.log(`[Rank] Ranking up to ${TOP_K} articles for ${topic} from ${articles.length} candidates...`);
    const ranked = await rankArticlesForTopic(articles, topic, weekLabel);
    console.log(`[Rank] LLM returned ${ranked.length} ranked items`);

    // PHASE B: Deterministic Selection
    console.log(`[Select] Applying constraints to select top ${topN} from ${ranked.length} ranked items...`);
    const { selected, report } = selectFromRanked(ranked, articles, topic, topN);
    
    console.log(`[Select] Selected ${selected.length} articles for ${topic}`);
    console.log(`[Select] Exclusions: domainCap=${report.exclusion_counts.domainCap}, duplicate=${report.exclusion_counts.duplicate}, hardControversy=${report.exclusion_counts.hardControversy}, sponsored=${report.exclusion_counts.sponsored}`);
    if (report.fallback_used.domainCapRelaxed) {
      console.log(`[Select] ⚠️  Domain cap relaxed to 3`);
    }

    return { selected, report };
  } catch (error: any) {
    console.error(`[Select] Error selecting articles for ${topic}:`, error.message);
    // Fallback: return top N by word count
    const fallback = articles
      .filter(a => !isSponsored(a) && !detectHardControversy(a))
      .sort((a, b) => b.wordCount - a.wordCount)
      .slice(0, topN)
      .map((article, idx) => ({
        url: article.url,
        title: article.title,
        snippet: article.snippet,
        domain: article.domain,
        publishedDate: article.publishedDate,
        publishedDateInvalid: article.publishedDateInvalid,
        discoveredAt: article.discoveredAt,
        rank: idx + 1,
        why: 'Selected by fallback (word count)',
        confidence: 0.5,
        category: topic
      }));

    return {
      selected: fallback,
      report: {
        candidate_count: articles.length,
        ranked_top_k_count: 0,
        selected_count: fallback.length,
        exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
        fallback_used: { domainCapRelaxed: false }
      }
    };
  }
}

export type SelectionReportsByTopic = Record<Topic, SelectionReport>;

export async function selectTopArticles(
  articles: ExtractedArticle[],
  topN: number,
  weekLabel: string,
  discoveryDir: string
): Promise<{ selected: SelectedArticle[]; reportsByTopic: SelectionReportsByTopic; aggregatedReport: SelectionReport }> {
  const selectedPath = path.join(discoveryDir, 'selected-top20.json');
  const reportPath = path.join(discoveryDir, 'report.json');
  
  // Check if already selected
  try {
    const existing = JSON.parse(await fs.readFile(selectedPath, 'utf-8'));
    console.log(`[Select] Using cached selection from ${selectedPath}`);
    try {
      const report = JSON.parse(await fs.readFile(reportPath, 'utf-8'));
      if (report && report.by_topic && report.aggregated) {
        return {
          selected: existing,
          reportsByTopic: report.by_topic,
          aggregatedReport: report.aggregated
        };
      }
    } catch {
      // Ignore and fall through
    }
    const emptyReports: SelectionReportsByTopic = {
      "AI_and_Strategy": {
        candidate_count: 0,
        ranked_top_k_count: 0,
        selected_count: 0,
        exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
        fallback_used: { domainCapRelaxed: false }
      },
      "Ecommerce_Retail_Tech": {
        candidate_count: 0,
        ranked_top_k_count: 0,
        selected_count: 0,
        exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
        fallback_used: { domainCapRelaxed: false }
      },
      "Luxury_and_Consumer": {
        candidate_count: 0,
        ranked_top_k_count: 0,
        selected_count: 0,
        exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
        fallback_used: { domainCapRelaxed: false }
      },
      "Jewellery_Industry": {
        candidate_count: 0,
        ranked_top_k_count: 0,
        selected_count: 0,
        exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
        fallback_used: { domainCapRelaxed: false }
      }
    };
    if (Array.isArray(existing)) {
      for (const item of existing) {
        const topic = item.category as Topic | undefined;
        if (topic && emptyReports[topic]) {
          emptyReports[topic].selected_count += 1;
        }
      }
    }
    const aggregatedReport: SelectionReport = {
      candidate_count: 0,
      ranked_top_k_count: 0,
      selected_count: existing.length,
      exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
      fallback_used: { domainCapRelaxed: false }
    };
    return { selected: existing, reportsByTopic: emptyReports, aggregatedReport };
  } catch {
    // Continue to select
  }

  // Classify articles into topics (simple keyword matching for now)
  const byTopic: Record<Topic, ExtractedArticle[]> = {
    "AI_and_Strategy": [],
    "Ecommerce_Retail_Tech": [],
    "Luxury_and_Consumer": [],
    "Jewellery_Industry": []
  };

  // Simple keyword-based classification
  for (const article of articles) {
    const text = `${article.title} ${article.snippet} ${article.extractedText}`.toLowerCase();
    
    if (text.includes('jewel') || text.includes('diamond') || text.includes('gem') || text.includes('cartier') || text.includes('tiffany')) {
      byTopic["Jewellery_Industry"].push(article);
    } else if (text.includes('ai ') || text.includes('artificial intelligence') || text.includes('machine learning') || text.includes('llm') || text.includes('gpt')) {
      byTopic["AI_and_Strategy"].push(article);
    } else if (text.includes('luxury') || text.includes('premium') || text.includes('high-end')) {
      byTopic["Luxury_and_Consumer"].push(article);
    } else {
      byTopic["Ecommerce_Retail_Tech"].push(article);
    }
  }

  // Select top N per topic
  const allSelected: SelectedArticle[] = [];
  const allReports: SelectionReport[] = [];
  const reportsByTopic: SelectionReportsByTopic = {
    "AI_and_Strategy": {
      candidate_count: 0,
      ranked_top_k_count: 0,
      selected_count: 0,
      exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
      fallback_used: { domainCapRelaxed: false }
    },
    "Ecommerce_Retail_Tech": {
      candidate_count: 0,
      ranked_top_k_count: 0,
      selected_count: 0,
      exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
      fallback_used: { domainCapRelaxed: false }
    },
    "Luxury_and_Consumer": {
      candidate_count: 0,
      ranked_top_k_count: 0,
      selected_count: 0,
      exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
      fallback_used: { domainCapRelaxed: false }
    },
    "Jewellery_Industry": {
      candidate_count: 0,
      ranked_top_k_count: 0,
      selected_count: 0,
      exclusion_counts: { domainCap: 0, duplicate: 0, hardControversy: 0, sponsored: 0 },
      fallback_used: { domainCapRelaxed: false }
    }
  };
  
  for (const [topic, topicArticles] of Object.entries(byTopic)) {
    if (topicArticles.length === 0) continue;
    
    const { selected, report } = await selectArticlesForTopic(topicArticles, topic as Topic, topN, weekLabel);
    allSelected.push(...selected);
    allReports.push(report);
    reportsByTopic[topic as Topic] = report;
  }

  // Sort by rank and category
  allSelected.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.rank - b.rank;
  });

  // Aggregate report
  const aggregatedReport: SelectionReport = {
    candidate_count: allReports.reduce((sum, r) => sum + r.candidate_count, 0),
    ranked_top_k_count: allReports.reduce((sum, r) => sum + r.ranked_top_k_count, 0),
    selected_count: allSelected.length,
    exclusion_counts: {
      domainCap: allReports.reduce((sum, r) => sum + r.exclusion_counts.domainCap, 0),
      duplicate: allReports.reduce((sum, r) => sum + r.exclusion_counts.duplicate, 0),
      hardControversy: allReports.reduce((sum, r) => sum + r.exclusion_counts.hardControversy, 0),
      sponsored: allReports.reduce((sum, r) => sum + r.exclusion_counts.sponsored, 0)
    },
    fallback_used: {
      domainCapRelaxed: allReports.some(r => r.fallback_used.domainCapRelaxed)
    }
  };

  // Save selection and report
  await fs.mkdir(discoveryDir, { recursive: true });
  await fs.writeFile(selectedPath, JSON.stringify(allSelected, null, 2), 'utf-8');
  await fs.writeFile(reportPath, JSON.stringify({ aggregated: aggregatedReport, by_topic: reportsByTopic }, null, 2), 'utf-8');

  // Print summary
  console.log('\n=== SELECTION SUMMARY ===');
  console.log(`Candidates: ${aggregatedReport.candidate_count}`);
  console.log(`Ranked (TOP_K): ${aggregatedReport.ranked_top_k_count}`);
  console.log(`Selected: ${aggregatedReport.selected_count}`);
  console.log(`Exclusions:`);
  console.log(`  - Domain cap: ${aggregatedReport.exclusion_counts.domainCap}`);
  console.log(`  - Duplicates: ${aggregatedReport.exclusion_counts.duplicate}`);
  console.log(`  - Hard controversy: ${aggregatedReport.exclusion_counts.hardControversy}`);
  console.log(`  - Sponsored: ${aggregatedReport.exclusion_counts.sponsored}`);
  if (aggregatedReport.fallback_used.domainCapRelaxed) {
    console.log(`⚠️  Fallback: Domain cap relaxed to 3`);
  }
  console.log(`\nReport saved to: ${reportPath}`);

  return { selected: allSelected, reportsByTopic, aggregatedReport };
}
