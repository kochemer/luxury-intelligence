import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import type { SelectedArticle } from './selectTop';
import type { Article } from '../ingestion/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, '../data/articles.json');

// Generate article ID (same as fetchRss uses)
function hashString(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

// Normalize title for deduplication
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate title similarity (simple Jaccard similarity)
function titleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(normalizeTitle(title1).split(/\s+/));
  const words2 = new Set(normalizeTitle(title2).split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

async function loadArticles(): Promise<Article[]> {
  try {
    const buf = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(buf);
  } catch (err) {
    return [];
  }
}

/**
 * Save discovery articles separately (week-scoped) instead of merging into global articles.json
 * Still checks against existing articles for deduplication, but stores separately
 */
export async function mergeDiscoveryArticles(
  selected: SelectedArticle[],
  weekLabel: string
): Promise<{ added: number; updated: number }> {
  // Load existing articles for deduplication check
  const existingArticles = await loadArticles();
  const existingByUrl = new Map<string, Article>();
  const existingByNormalizedTitle = new Map<string, Article>();
  
  for (const article of existingArticles) {
    existingByUrl.set(article.url, article);
    existingByNormalizedTitle.set(normalizeTitle(article.title), article);
  }

  // Load existing discovery articles for this week (if any)
  const weekDir = path.join(__dirname, '../data/weeks', weekLabel);
  const discoveryArticlesPath = path.join(weekDir, 'discoveryArticles.json');
  let existingDiscoveryArticles: Article[] = [];
  try {
    const buf = await fs.readFile(discoveryArticlesPath, 'utf-8');
    existingDiscoveryArticles = JSON.parse(buf);
  } catch (err) {
    // File doesn't exist yet, start with empty array
  }

  const discoveryByUrl = new Map<string, Article>();
  for (const article of existingDiscoveryArticles) {
    discoveryByUrl.set(article.url, article);
  }

  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();
  const newDiscoveryArticles: Article[] = [...existingDiscoveryArticles];

  for (const selectedArticle of selected) {
    // Check for exact URL match in existing articles (global)
    const existingByUrlMatch = existingByUrl.get(selectedArticle.url);
    if (existingByUrlMatch) {
      // Skip if already in global articles.json
      console.log(`[Merge] Skipping: already exists in articles.json: "${selectedArticle.title}"`);
      continue;
    }

    // Check for title similarity in existing articles (global)
    const normalizedTitle = normalizeTitle(selectedArticle.title);
    const existingByTitleMatch = existingByNormalizedTitle.get(normalizedTitle);
    if (existingByTitleMatch) {
      const similarity = titleSimilarity(selectedArticle.title, existingByTitleMatch.title);
      if (similarity > 0.8) {
        console.log(`[Merge] Skipping duplicate: "${selectedArticle.title}" (similarity: ${similarity.toFixed(2)})`);
        continue;
      }
    }

    // Check if already in this week's discovery articles
    const existingInDiscovery = discoveryByUrl.get(selectedArticle.url);
    if (existingInDiscovery) {
      // Update existing discovery article if needed
      if (!existingInDiscovery.snippet && selectedArticle.snippet) {
        existingInDiscovery.snippet = selectedArticle.snippet;
        updated++;
      }
      continue;
    }

    // Create new discovery article
    // Use discoveredAt from extraction if available, otherwise use current time
    const discoveredAt = (selectedArticle as any).discoveredAt || now;
    
    const newArticle: Article = {
      id: hashString(selectedArticle.url),
      title: selectedArticle.title,
      url: selectedArticle.url,
      source: selectedArticle.domain,
      published_at: selectedArticle.publishedDate || now, // Fallback to now if missing
      ingested_at: now,
      snippet: selectedArticle.snippet,
      discoveredAt: discoveredAt,
      publishedDateInvalid: (selectedArticle as any).publishedDateInvalid || false,
      sourceType: 'discovery'
    };

    newDiscoveryArticles.push(newArticle);
    discoveryByUrl.set(newArticle.url, newArticle);
    added++;
  }

  // Save discovery articles to week-scoped file
  await fs.mkdir(weekDir, { recursive: true });
  await fs.writeFile(discoveryArticlesPath, JSON.stringify(newDiscoveryArticles, null, 2), 'utf-8');

  return { added, updated };
}

