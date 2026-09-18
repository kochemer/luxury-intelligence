/**
 * Module function for building weekly email digest
 * Extracted from scripts/buildWeeklyEmailDigest.ts for use by orchestrator
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import { computeCommerceMateriality } from '../scoring/commerceMateriality';
import type { Article, WeeklyDigest, EmailDigest, EmailDigestItem } from '../lib/types';
import { enrichFullText } from '../podcast/enrichFullText';

import { getModelFor, maxTokensParam, temperatureParam } from '../lib/llm/models';
const EMAIL_DIGEST_MODEL = process.env.EMAIL_DIGEST_MODEL || getModelFor('summarize');
const TEMPERATURE = 0.3;
const MAX_TOKENS = 500;

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
}

async function loadFullTextFromCache(url: string, weekLabel: string): Promise<string | null> {
  try {
    const cachePath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'podcast', 'fulltext', `${hashUrl(url)}.json`);
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

/**
 * Get full text for an article.
 * We consider "full text available" only when extraction succeeded and we have substantial text.
 * Uses cache in `data/weeks/{week}/podcast/fulltext/{hash}.json`, and will try to enrich on-demand if missing.
 */
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
 */
async function selectAndRankArticles(
  digest: WeeklyDigest,
  topN: number,
  weekLabel: string
): Promise<Array<Article & { commerceMaterialityScore: number; commerceMaterialitySignals: string[] }>> {
  const categoryOrder: Array<keyof WeeklyDigest['topics']> = [
    'Ecommerce_Retail_Tech',
    'Jewellery_Industry',
    'AI_and_Strategy',
    'Luxury_and_Consumer',
  ];
  
  const selectionPattern = [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 1], [2, 1], [1, 1], [0, 2],
  ];
  
  const selected: Array<Article & { commerceMaterialityScore: number; commerceMaterialitySignals: string[] }> = [];
  const seen = new Set<string>();
  
  for (const [categoryIdx, startRankIdx] of selectionPattern) {
    if (selected.length >= topN) break;
    
    const categoryKey = categoryOrder[categoryIdx];
    const topic = digest.topics[categoryKey];
    
    if (!topic || !topic.top || topic.top.length === 0) {
      continue;
    }
    
    // Try articles starting from startRankIdx, incrementing until we find one with full text
    let foundArticle = false;
    for (let rankIdx = startRankIdx; rankIdx < topic.top.length; rankIdx++) {
      if (selected.length >= topN) break;
      
      const article = topic.top[rankIdx];
      
      // Skip if already seen (duplicate URL)
      if (seen.has(article.url)) {
        continue;
      }
      
      // Check if full text is available (cache or on-demand extraction)
      const fullText = await getFullTextForArticle(
        { url: article.url, title: article.title, source: article.source },
        weekLabel
      );
      if (!fullText) {
        console.log(`[EmailDigest] Skipping "${article.title}" - full text not available, trying next article in ${categoryKey}`);
        continue; // Try next article in same category
      }
      
      // Full text available - include this article
      const materiality = computeCommerceMateriality({
        title: article.title,
        source: article.source,
        snippet: article.snippet,
        aiSummary: article.aiSummary,
      });
      
      selected.push({
        ...article,
        commerceMaterialityScore: materiality.score,
        commerceMaterialitySignals: materiality.signals,
      });
      seen.add(article.url);
      foundArticle = true;
      break; // Found one with full text, move to next pattern item
    }
    
    if (!foundArticle) {
      console.warn(`[EmailDigest] No articles with full text found in ${categoryKey} starting from rank ${startRankIdx}`);
    }
  }
  
  return selected.slice(0, topN);
}

/**
 * Generate bullets for an article using LLM
 */
async function generateBullets(article: Article, weekLabel: string, apiKey: string): Promise<string[]> {
  // Get full text - this is required for email digest articles
  const fullText = await getFullTextForArticle({ url: article.url, title: article.title, source: article.source }, weekLabel);
  
  if (!fullText || fullText.length < 200) {
    // Should not happen since we filter for full text in selection, but handle gracefully
    const fallback = article.aiSummary || article.snippet || '';
    if (fallback.length < 50) {
      return [article.title, 'Read the full article for details.', 'Read the full article for complete details.'];
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
          content: 'You output ONLY valid JSON objects with a "bullets" array, no markdown, no code blocks.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      ...temperatureParam(EMAIL_DIGEST_MODEL, TEMPERATURE),
      ...maxTokensParam(EMAIL_DIGEST_MODEL, MAX_TOKENS),
      response_format: { type: 'json_object' },
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
    
    let bullets: string[] = [];
    if (Array.isArray(parsed.bullets)) {
      bullets = parsed.bullets;
    } else if (Array.isArray(parsed)) {
      bullets = parsed;
    } else if (parsed.bullet1 || parsed.bullet2) {
      bullets = [parsed.bullet1, parsed.bullet2, parsed.bullet3].filter(Boolean);
    }
    
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
    
    // Filter out implication bullets from LLM-generated bullets
    const implicationPatterns = [
      /should consider/i, /must adapt/i, /should adapt/i, /should leverage/i, /can leverage/i,
      /must reassess/i, /must balance/i, /should balance/i, /can improve/i, /should improve/i,
      /strategists should/i, /retailers should/i, /retailers must/i, /retailers can/i,
      /implication/i, /for retailers/i, /for brands/i, /competitive advantage/i,
      /to enhance/i, /to boost/i, /to improve/i, /to address/i, /to leverage/i,
      /must balance/i, /should balance/i, /to sustain/i, /to maintain/i,
    ];
    
    filteredBullets = filteredBullets.filter(b => {
      // Filter out implication bullets - check if bullet contains any implication pattern
      const hasImplication = implicationPatterns.some(pattern => pattern.test(b));
      // Also check if bullet starts with action verbs that suggest recommendations
      const startsWithAction = /^(retailers|brands|strategists|companies|businesses)\s+(should|must|can|need to|will)/i.test(b);
      return !hasImplication && !startsWithAction;
    });
    
    // Check for duplicates between bullets (semantic similarity)
    // Also check for semantic similarity using key terms, not just exact word matches
    const deduplicatedBullets: string[] = [];
    for (const bullet of filteredBullets) {
      const isDuplicate = deduplicatedBullets.some(existing => {
        // Method 1: Exact word overlap (for same phrasing)
        const existingWords = existing.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const bulletWords = bullet.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const wordOverlap = existingWords.filter(w => bulletWords.includes(w)).length;
        const wordSimilarity = wordOverlap / Math.max(existingWords.length, bulletWords.length);
        
        // Method 2: Key concept overlap (for semantic similarity)
        // Extract key nouns/concepts (longer words, numbers, important terms)
        const existingConcepts: string[] = existing.toLowerCase().match(/\b(\d+|[a-z]{5,})\b/g) || [];
        const bulletConcepts: string[] = bullet.toLowerCase().match(/\b(\d+|[a-z]{5,})\b/g) || [];
        const conceptOverlap = existingConcepts.filter(c => bulletConcepts.includes(c)).length;
        const conceptSimilarity = conceptOverlap / Math.max(existingConcepts.length, bulletConcepts.length);
        
        // Consider duplicate if either word similarity >40% OR concept similarity >50%
        // This catches both exact rephrasing and semantic duplicates
        return wordSimilarity > 0.4 || conceptSimilarity > 0.5;
      });
      
      if (!isDuplicate) {
        deduplicatedBullets.push(bullet);
      }
    }
    
    bullets = deduplicatedBullets;
    
    // Log if we filtered out bullets (for debugging)
    if (filteredBullets.length < bullets.length) {
      console.warn(`[EmailDigest] Filtered out ${bullets.length - filteredBullets.length} implication bullets for "${article.title}"`);
    }
    if (deduplicatedBullets.length < filteredBullets.length) {
      console.warn(`[EmailDigest] Removed ${filteredBullets.length - deduplicatedBullets.length} duplicate bullets for "${article.title}"`);
    }
    
    // Ensure we always return 3 bullets
    if (bullets.length === 0) {
      // Don't use title as fallback - use generic messages
      bullets = ['Read the full article for details.', 'Read the full article for complete details.', 'Read the full article for more information.'];
    }
    
    // If we have fewer than 3 bullets, fill from article text (not title)
    if (bullets.length < 3 && articleText.length > 100) {
      const sentences = articleText
        .split(/[.!?]+\s+/)
        .map(s => s.trim())
        .filter(s => s.length >= 20 && s.length <= 200)
        .filter(s => {
          // Filter out implication patterns (same as above)
          const implicationPatterns = [
            /should consider/i, /must adapt/i, /should adapt/i, /should leverage/i, /can leverage/i,
            /must reassess/i, /must balance/i, /should balance/i, /can improve/i, /should improve/i,
            /strategists should/i, /retailers should/i, /retailers must/i, /retailers can/i,
            /implication/i, /for retailers/i, /for brands/i, /competitive advantage/i,
            /to enhance/i, /to boost/i, /to improve/i, /to address/i, /to leverage/i,
            /must balance/i, /should balance/i, /to sustain/i, /to maintain/i,
          ];
          const hasImplication = implicationPatterns.some(pattern => pattern.test(s));
          const startsWithAction = /^(retailers|brands|strategists|companies|businesses)\s+(should|must|can|need to|will)/i.test(s);
          return !hasImplication && !startsWithAction;
        });
      
      for (const sentence of sentences) {
        if (bullets.length >= 3) break;
        
        // Check if sentence is too similar to title
        const normalizedSentence = normalizeForComparison(sentence);
        const titleWords = normalizedTitle.split(/\s+/).filter(w => w.length > 2);
        const sentenceWords = normalizedSentence.split(/\s+/).filter(w => w.length > 2);
        if (titleWords.length > 0) {
          const overlap = titleWords.filter(w => sentenceWords.includes(w)).length;
          const similarity = overlap / Math.max(titleWords.length, sentenceWords.length);
          if (similarity > 0.7) {
            continue; // Too similar to title, skip
          }
        }
        
        // Check for duplicates with existing bullets (stricter: 40% similarity)
        const isDuplicate = bullets.some(bullet => {
          const bulletWords = bullet.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const sentenceWords = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const overlap = bulletWords.filter(w => sentenceWords.includes(w)).length;
          const similarity = overlap / Math.max(bulletWords.length, sentenceWords.length);
          return similarity > 0.4;
        });
        if (!isDuplicate) {
          bullets.push(sentence);
        }
      }
    }
    
    // Final fallback: ensure at least 3 bullets
    while (bullets.length < 3) {
      bullets.push('Read the full article for details.');
    }
    
    return bullets.slice(0, 3);
  } catch (error) {
    console.warn(`[EmailDigest] Failed to generate bullets for "${article.title}": ${(error as Error).message}`);
    // Don't return title - return generic fallback
    return ['Read the full article for details.', 'Read the full article for complete details.', 'Read the full article for more information.'];
  }
}

/**
 * Generate intro paragraph (optional)
 */
async function generateIntro(articles: Article[], weekLabel: string, apiKey: string): Promise<string | undefined> {
  const openai = new OpenAI({ apiKey });
  
  const titles = articles.map(a => a.title).join(', ');
  
  const prompt = `Write a 2-3 sentence intro framing the week's intelligence digest.

Week: ${weekLabel}
Top articles: ${titles}

Keep it brief, professional, and set context for a retail/luxury/AI intelligence reader.`;

  try {
    const response = await openai.chat.completions.create({
      model: EMAIL_DIGEST_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You write concise, professional introductions for intelligence digests.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      ...temperatureParam(EMAIL_DIGEST_MODEL, TEMPERATURE),
      ...maxTokensParam(EMAIL_DIGEST_MODEL, 150),
    });
    
    const content = response.choices[0]?.message?.content?.trim();
    return content || undefined;
  } catch (error) {
    console.warn(`[EmailDigest] Failed to generate intro: ${(error as Error).message}`);
    return undefined;
  }
}

/**
 * Build weekly email digest
 */
export async function buildWeeklyEmailDigest(weekLabel: string, topN: number = 8): Promise<EmailDigest> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }

  // Load weekly digest
  const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
  const digestContent = await fs.readFile(digestPath, 'utf-8');
  const digest: WeeklyDigest = JSON.parse(digestContent);

  // Select and rank articles (only those with full text available)
  const selectedArticles = await selectAndRankArticles(digest, topN, weekLabel);

  // Generate intro
  const intro = await generateIntro(selectedArticles, weekLabel, apiKey);

  // Generate bullets for each article
  const items: EmailDigestItem[] = [];
  for (let i = 0; i < selectedArticles.length; i++) {
    const article = selectedArticles[i];
    const bullets = await generateBullets(article, weekLabel, apiKey);
    // Get article summary for bullet extraction fallback
    const summary = article.aiSummary || article.snippet || '';
    items.push({
      rank: i + 1,
      title: article.title,
      url: article.url,
      source: article.source,
      bullets,
      summary: summary.trim() || undefined,
    });
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Select "read one thing" (top article)
  const readOneThing = items.length > 0 ? {
    title: items[0].title,
    url: items[0].url,
  } : undefined;

  // Build email digest
  const emailDigest: EmailDigest = {
    week: weekLabel,
    generatedAt: new Date().toISOString(),
    intro,
    // The Editor's Take opens the email as it opens the page (roadmap F3.1).
    editorialTake: digest.editorialTake?.trim() || undefined,
    readOneThing,
    items,
  };

  // Save to file
  const outputPath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'email-digest.json');
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(emailDigest, null, 2), 'utf-8');

  return emailDigest;
}
