/**
 * Build weekly email digest: single ranked list of top N articles with sharp bullets
 * Phase 1: Generate JSON artifact only (no email sending)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import OpenAI from 'openai';
import { computeCommerceMateriality, getTopByMateriality } from '../scoring/commerceMateriality';
import { loadEnv } from '../lib/env';
import { getCurrentDigestWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import type { Article, WeeklyDigest, EmailDigest, EmailDigestItem } from '../lib/types';
import { enrichFullText } from '../podcast/enrichFullText';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (must be before any env var access)
loadEnv();

// Configuration
import { getModelFor, maxTokensParam, temperatureParam, getReasoningFor, reasoningParam } from '../lib/llm/models';
const EMAIL_DIGEST_MODEL = process.env.EMAIL_DIGEST_MODEL || getModelFor('summarize');
const TEMPERATURE = 0.3;
const MAX_TOKENS = 500;

// Commerce Materiality weights
const COMMERCE_MATERIALITY_WEIGHT_ECOM = parseFloat(process.env.COMMERCE_MATERIALITY_WEIGHT_ECOM || '1.5');
const COMMERCE_MATERIALITY_WEIGHT_EMAIL = parseFloat(process.env.COMMERCE_MATERIALITY_WEIGHT_EMAIL || '1.2');
const COMMERCE_MATERIALITY_WEIGHT_OTHER = parseFloat(process.env.COMMERCE_MATERIALITY_WEIGHT_OTHER || '0.3');


function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
}

async function loadFullTextFromCache(url: string, weekLabel: string): Promise<string | null> {
  try {
    const cachePath = path.join(__dirname, '../data/weeks', weekLabel, 'podcast', 'fulltext', `${hashUrl(url)}.json`);
    const raw = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(raw) as { status?: string; text?: string; wordCount?: number };
    if (parsed.status === 'success' && typeof parsed.text === 'string' && parsed.text.trim().length > 500) {
      return parsed.text.trim();
    }
    return null;
  } catch {
    return null;
  }
}

async function getFullTextForArticle(article: Pick<Article, 'url' | 'title' | 'source'>, weekLabel: string): Promise<string | null> {
  const cached = await loadFullTextFromCache(article.url, weekLabel);
  if (cached) return cached;

  try {
    const enriched = await enrichFullText(
      [{ url: article.url, title: article.title, source: article.source }],
      weekLabel,
      { force: false, topKPerCategory: 1 }
    );
    const result = enriched.get(article.url);
    if (result && result.status === 'success' && typeof result.text === 'string' && result.text.trim().length > 500) {
      return result.text.trim();
    }
  } catch (err) {
    console.warn(`[EmailDigest] Full text enrichment failed for ${article.url}: ${(err as Error).message}`);
  }

  return null;
}

/**
 * Select and rank articles for email digest
 * Only includes articles that have full text available
 * If full text is not available, tries the next article (N+1) from the same category
 * 
 * Deterministic selection pattern:
 * 1. top 1 from cat 1 (Ecommerce_Retail_Tech)
 * 2. top 1 from cat 2 (Jewellery_Industry)
 * 3. top 1 from cat 3 (AI_and_Strategy)
 * 4. top 1 from cat 4 (Luxury_and_Consumer)
 * 5. top 2 from cat 1 (Ecommerce_Retail_Tech)
 * 6. top 2 from cat 3 (AI_and_Strategy)
 * 7. top 2 from cat 2 (Jewellery_Industry)
 * 8. top 3 from cat 1 (Ecommerce_Retail_Tech)
 */
async function selectAndRankArticles(digest: WeeklyDigest, topN: number, weekLabel: string): Promise<Array<Article & { commerceMaterialityScore: number; commerceMaterialitySignals: string[] }>> {
  const categoryOrder: Array<keyof WeeklyDigest['topics']> = [
    'Ecommerce_Retail_Tech',     // cat 1
    'Jewellery_Industry',       // cat 2
    'AI_and_Strategy',          // cat 3
    'Luxury_and_Consumer'      // cat 4
  ];
  
  // Selection pattern: [categoryIndex, rankIndex] where rankIndex is 0-based
  const selectionPattern = [
    [0, 0], // top 1 from cat 1 (Ecommerce_Retail_Tech)
    [1, 0], // top 1 from cat 2 (Jewellery_Industry)
    [2, 0], // top 1 from cat 3 (AI_and_Strategy)
    [3, 0], // top 1 from cat 4 (Luxury_and_Consumer)
    [0, 1], // top 2 from cat 1 (Ecommerce_Retail_Tech)
    [2, 1], // top 2 from cat 3 (AI_and_Strategy)
    [1, 1], // top 2 from cat 2 (Jewellery_Industry)
    [0, 2], // top 3 from cat 1 (Ecommerce_Retail_Tech)
  ];
  
  const selected: Array<Article & { commerceMaterialityScore: number; commerceMaterialitySignals: string[] }> = [];
  const seen = new Set<string>();
  
  // Process selection pattern
  for (const [categoryIdx, startRankIdx] of selectionPattern) {
    if (selected.length >= topN) break;
    
    const categoryKey = categoryOrder[categoryIdx];
    const topic = digest.topics[categoryKey];
    
    if (!topic || !topic.top || topic.top.length === 0) {
      continue;
    }
    
    // Take the article at exactly startRankIdx (skip only true duplicates)
    let foundArticle = false;
    for (let rankIdx = startRankIdx; rankIdx < topic.top.length; rankIdx++) {
      if (selected.length >= topN) break;

      const article = topic.top[rankIdx];

      if (seen.has(article.url)) continue;

      const materiality = computeCommerceMateriality({
        title: article.title,
        source: article.source,
        snippet: article.snippet,
        aiSummary: article.aiSummary
      });

      selected.push({
        id: article.id,
        title: article.title,
        url: article.url,
        source: article.source,
        published_at: article.published_at,
        ingested_at: article.ingested_at,
        snippet: article.snippet,
        aiSummary: article.aiSummary,
        commerceMaterialityScore: materiality.score,
        commerceMaterialitySignals: materiality.signals
      });
      seen.add(article.url);
      foundArticle = true;
      break;
    }

    if (!foundArticle) {
      console.warn(`[EmailDigest] No article found in ${categoryKey} at rank ${startRankIdx}`);
    }
  }
  
  // Return exactly topN (or fewer if not enough articles available)
  return selected.slice(0, topN);
}

/**
 * Generate bullets for an article using LLM
 */
async function generateBullets(
  article: Article,
  weekLabel: string,
  apiKey: string
): Promise<string[]> {
  // Get full text - this is required for email digest articles
  const fullText = await getFullTextForArticle({ url: article.url, title: article.title, source: article.source }, weekLabel);
  
  if (!fullText || fullText.length < 200) {
    // Should not happen since we filter for full text in selection, but handle gracefully
    const fallback = article.aiSummary || article.snippet || '';
    if (fallback.length < 50) {
      return ['Read the full article for details.', 'Read the full article for complete details.', 'Read the full article for more information.'];
    }
  }
  
  // Use full text (up to 8000 chars to give LLM enough context)
  const articleText = fullText ? fullText.substring(0, 8000) : (article.aiSummary || article.snippet || '');
  
  const openai = new OpenAI({ apiKey });
  
  const prompt = `You are summarizing an article for a weekly intelligence digest. Your task is to write 3 distinct sentences that summarize the article.

Article Title: ${article.title}
Source: ${article.source}

Full Article Text:
${articleText}

Your task: Write exactly 3 distinct sentences that summarize this article. Each sentence must:
1. Be a complete, factual sentence (15-25 words)
2. Cover a DIFFERENT aspect of the article:
   - Sentence 1: The main event, announcement, or development
   - Sentence 2: A specific detail, data point, number, or consequence
   - Sentence 3: Context, scale, timeline, or a related development
3. Be written as a summary sentence (not a bullet point format)
4. NOT repeat or rephrase the article title
5. NOT include implications, recommendations, or "what this means"
6. NOT use phrases like "retailers should", "brands must", "strategists should consider"
7. Use specific, concrete language with actual details from the article
8. Avoid generic verbs like "explores", "highlights", "discusses", "examines"

CRITICAL RULES:
- Each sentence must cover DIFFERENT information - no repetition
- Do NOT rephrase the article title
- Do NOT use the article title as one of the sentences
- Focus on WHAT HAPPENED, not what should happen

Output as JSON object with a "bullets" array containing your 3 summary sentences:
{"bullets": ["sentence 1", "sentence 2", "sentence 3"]}`;

  try {
    const response = await openai.chat.completions.create({
      model: EMAIL_DIGEST_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You output ONLY valid JSON objects with a "bullets" array, no markdown, no code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      ...temperatureParam(EMAIL_DIGEST_MODEL, TEMPERATURE),
      ...reasoningParam(EMAIL_DIGEST_MODEL, getReasoningFor('summarize')),
      ...maxTokensParam(EMAIL_DIGEST_MODEL, MAX_TOKENS),
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in LLM response');
    }
    
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
    }
    
    const parsed = JSON.parse(jsonContent);
    
    // Extract bullets from response
    let bullets: string[] = [];
    if (Array.isArray(parsed.bullets)) {
      bullets = parsed.bullets;
    } else if (Array.isArray(parsed)) {
      bullets = parsed;
    } else if (parsed.bullet1 || parsed.bullet2) {
      bullets = [parsed.bullet1, parsed.bullet2, parsed.bullet3].filter(Boolean);
    }
    
    // Validate and clean bullets
    bullets = bullets
      .filter(b => typeof b === 'string' && b.trim().length > 0)
      .map(b => b.trim())
      .slice(0, 3);
    
    // Normalize title for comparison (remove punctuation, lowercase)
    const normalizeForComparison = (text: string): string => {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const normalizedTitle = normalizeForComparison(article.title);
    
    // Filter out bullets that are just the title or very similar to it
    let filteredBullets = bullets.filter(b => {
      const normalizedBullet = normalizeForComparison(b);
      
      // Check if bullet is essentially the title
      if (normalizedBullet === normalizedTitle) {
        return false; // Exact match
      }
      
      // Check if bullet is >80% similar to title (likely a rephrasing)
      const titleWords = normalizedTitle.split(/\s+/).filter(w => w.length > 2);
      const bulletWords = normalizedBullet.split(/\s+/).filter(w => w.length > 2);
      if (titleWords.length > 0) {
        const overlap = titleWords.filter(w => bulletWords.includes(w)).length;
        const similarity = overlap / Math.max(titleWords.length, bulletWords.length);
        if (similarity > 0.8) {
          return false; // Too similar to title
        }
      }
      
      return true;
    });
    
    // Filter out implication bullets
    const implicationPatterns = [
      /should consider/i, /must adapt/i, /should adapt/i, /should leverage/i, /can leverage/i,
      /must reassess/i, /must balance/i, /should balance/i, /can improve/i, /should improve/i,
      /strategists should/i, /retailers should/i, /retailers must/i, /retailers can/i,
      /implication/i, /for retailers/i, /for brands/i, /competitive advantage/i,
      /to enhance/i, /to boost/i, /to improve/i, /to address/i, /to leverage/i,
      /must balance/i, /should balance/i, /to sustain/i, /to maintain/i,
    ];
    
    filteredBullets = filteredBullets.filter(b => {
      const hasImplication = implicationPatterns.some(pattern => pattern.test(b));
      const startsWithAction = /^(retailers|brands|strategists|companies|businesses)\s+(should|must|can|need to|will)/i.test(b);
      return !hasImplication && !startsWithAction;
    });
    
    // Check for duplicates between bullets
    const deduplicatedBullets: string[] = [];
    for (const bullet of filteredBullets) {
      const isDuplicate = deduplicatedBullets.some(existing => {
        const existingWords = existing.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const bulletWords = bullet.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const wordOverlap = existingWords.filter(w => bulletWords.includes(w)).length;
        const wordSimilarity = wordOverlap / Math.max(existingWords.length, bulletWords.length);
        
        const existingConcepts: string[] = existing.toLowerCase().match(/\b(\d+|[a-z]{5,})\b/g) || [];
        const bulletConcepts: string[] = bullet.toLowerCase().match(/\b(\d+|[a-z]{5,})\b/g) || [];
        const conceptOverlap = existingConcepts.filter(c => bulletConcepts.includes(c)).length;
        const conceptSimilarity = conceptOverlap / Math.max(existingConcepts.length, bulletConcepts.length);
        
        return wordSimilarity > 0.4 || conceptSimilarity > 0.5;
      });
      
      if (!isDuplicate) {
        deduplicatedBullets.push(bullet);
      }
    }
    
    bullets = deduplicatedBullets;
    
    // Ensure we always return 3 bullets
    if (bullets.length === 0) {
      bullets = ['Read the full article for details.', 'Read the full article for complete details.', 'Read the full article for more information.'];
    }
    
    // Final fallback: ensure at least 3 bullets
    while (bullets.length < 3) {
      bullets.push('Read the full article for details.');
    }
    
    return bullets.slice(0, 3);
  } catch (error) {
    console.warn(`[EmailDigest] Failed to generate bullets for "${article.title}": ${(error as Error).message}`);
    return ['Read the full article for details.', 'Read the full article for complete details.', 'Read the full article for more information.'];
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  let weekLabel: string | null = null;
  let topN = 8;
  let force = false;
  
  for (const arg of args) {
    if (arg.startsWith('--week=')) {
      weekLabel = arg.split('=')[1];
      if (!/^\d{4}-W\d{1,2}$/.test(weekLabel)) {
        console.error(`Invalid week format: ${weekLabel}. Expected YYYY-W##`);
        process.exit(1);
      }
    } else if (arg.startsWith('--topN=')) {
      topN = parseInt(arg.split('=')[1], 10);
      if (isNaN(topN) || topN < 1 || topN > 20) {
        console.error(`Invalid topN: ${topN}. Must be between 1 and 20`);
        process.exit(1);
      }
    } else if (arg === '--force') {
      force = true;
    }
  }
  
  if (!weekLabel) {
    weekLabel = getCurrentDigestWeek();
    console.log(`[EmailDigest] No --week provided, using computed digest week: ${weekLabel}`);
  }
  validateWeekLabel(weekLabel);
  
  // Check if already exists
  const outputPath = path.join(__dirname, '../data/weeks', weekLabel, 'email-digest.json');
  if (!force) {
    try {
      await fs.access(outputPath);
      console.log(`Email digest already exists for ${weekLabel}. Use --force to regenerate.`);
      process.exit(0);
    } catch {
      // File doesn't exist, proceed
    }
  }
  
  // Load weekly digest
  const digestPath = path.join(__dirname, '../data/digests', `${weekLabel}.json`);
  let digest: WeeklyDigest;
  try {
    const content = await fs.readFile(digestPath, 'utf-8');
    digest = JSON.parse(content);
  } catch (error) {
    console.error(`Error: Could not load digest from ${digestPath}`);
    console.error(`Make sure you've run buildWeeklyDigest for week ${weekLabel} first.`);
    process.exit(1);
  }
  
  console.log(`Building email digest for ${weekLabel}...`);
  console.log(`  Top N: ${topN}`);
  console.log('');
  
  // Select and rank articles
  const selectedArticles = await selectAndRankArticles(digest, topN, weekLabel);
  console.log(`Selected ${selectedArticles.length} articles:`);
  selectedArticles.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.title} (${a.source})`);
    console.log(`      Materiality: ${a.commerceMaterialityScore}/10 (${a.commerceMaterialitySignals.join(', ')})`);
  });
  console.log('');
  
  // Report top 10 by materiality across all categories
  console.log(`=== Commerce Materiality Top 10 ===`);
  const allArticles: Array<Article & { commerceMaterialityScore: number; commerceMaterialitySignals: string[] }> = [];
  for (const categoryKey of ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'] as const) {
    const topic = digest.topics[categoryKey];
    if (topic && topic.top) {
      for (const article of topic.top) {
        const materiality = computeCommerceMateriality({
          title: article.title,
          source: article.source,
          snippet: article.snippet,
          aiSummary: article.aiSummary
        });
        allArticles.push({
          ...article,
          commerceMaterialityScore: materiality.score,
          commerceMaterialitySignals: materiality.signals
        });
      }
    }
  }
  
  // Sort by materiality score
  allArticles.sort((a, b) => b.commerceMaterialityScore - a.commerceMaterialityScore);
  const top10 = allArticles.slice(0, 10);
  top10.forEach((article, idx) => {
    console.log(`  ${idx + 1}. [${article.commerceMaterialityScore}/10] ${article.title}`);
    console.log(`      Signals: ${article.commerceMaterialitySignals.join(', ')}`);
  });
  console.log('');
  
  // Get API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found in environment');
    process.exit(1);
  }
  
  // Generate bullets for each article
  console.log('Generating bullets...');
  const items: EmailDigestItem[] = [];
  
  for (let i = 0; i < selectedArticles.length; i++) {
    const article = selectedArticles[i];
    console.log(`  [${i + 1}/${selectedArticles.length}] ${article.title}`);
    
    const bullets = await generateBullets(article, weekLabel, apiKey);
    items.push({
      rank: i + 1,
      title: article.title,
      url: article.url,
      source: article.source,
      bullets
    });
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('');
  
  // Select "read one thing" (top article)
  const readOneThing = items.length > 0 ? {
    title: items[0].title,
    url: items[0].url
  } : undefined;
  
  // Build email digest
  const emailDigest: EmailDigest = {
    week: weekLabel,
    generatedAt: new Date().toISOString(),
    weeklyQuote: digest.oneSentenceSummary?.trim() || undefined,
    readOneThing,
    items
  };
  
  // Save to file
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(emailDigest, null, 2), 'utf-8');
  
  console.log(`✓ Email digest saved to: ${outputPath}`);
  console.log(`  Items: ${items.length}`);
  console.log(`  Quote: ${emailDigest.weeklyQuote ? 'Yes' : 'No'}`);
  console.log(`  Read One Thing: ${readOneThing ? 'Yes' : 'No'}`);
}

// Run if invoked directly
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
