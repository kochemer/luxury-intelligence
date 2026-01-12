import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { SearchResult } from './searchProvider';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ExtractedArticle = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
  extractedText: string;
  wordCount: number;
  author?: string;
  hash: string;
};

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
}

async function fetchHtml(url: string, fetchDir: string): Promise<string | null> {
  const hash = hashUrl(url);
  const htmlPath = path.join(fetchDir, `${hash}.html`);

  // Check cache
  try {
    const cached = await fs.readFile(htmlPath, 'utf-8');
    return cached;
  } catch {
    // Continue to fetch
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 10000, // 10 second timeout
      redirect: 'follow'
    });

    if (!response.ok) {
      console.warn(`[Fetch] Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();
    
    // Save to cache
    await fs.mkdir(fetchDir, { recursive: true });
    await fs.writeFile(htmlPath, html, 'utf-8');
    
    return html;
  } catch (error: any) {
    console.warn(`[Fetch] Error fetching ${url}: ${error.message}`);
    return null;
  }
}

function extractText(html: string, url: string): { text: string; title: string; author?: string; date?: string } {
  const $ = cheerio.load(html);
  
  // Remove script and style elements
  $('script, style, noscript, iframe, embed, object').remove();
  
  // Try to find main content
  let content = '';
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.article-body',
    '.post-content',
    '.entry-content',
    '.content',
    'body'
  ];
  
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      content = element.text();
      if (content.length > 500) break; // Found substantial content
    }
  }
  
  // Fallback to body if nothing found
  if (content.length < 500) {
    content = $('body').text();
  }
  
  // Clean up text
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
  
  // Extract title
  let title = $('title').text() || $('h1').first().text() || '';
  title = title.trim();
  
  // Try to extract author
  let author: string | undefined;
  const authorSelectors = [
    '[rel="author"]',
    '.author',
    '[itemprop="author"]',
    'meta[name="author"]'
  ];
  for (const selector of authorSelectors) {
    const authorEl = $(selector).first();
    if (authorEl.length > 0) {
      author = authorEl.text() || authorEl.attr('content');
      if (author) break;
    }
  }
  
  // Try to extract date
  let date: string | undefined;
  const dateSelectors = [
    'time[datetime]',
    '[itemprop="datePublished"]',
    'meta[property="article:published_time"]',
    'meta[name="publish-date"]'
  ];
  for (const selector of dateSelectors) {
    const dateEl = $(selector).first();
    if (dateEl.length > 0) {
      date = dateEl.attr('datetime') || dateEl.attr('content') || dateEl.text();
      if (date) break;
    }
  }
  
  return { text: content, title, author, date };
}

function isEnglish(text: string): boolean {
  // Simple heuristic: check if >80% of characters are ASCII
  const asciiChars = text.split('').filter(c => c.charCodeAt(0) < 128).length;
  return asciiChars / text.length > 0.8;
}

function isArticle(text: string, wordCount: number): boolean {
  // Must have substantial content
  if (wordCount < 200) return false;
  
  // Check for common non-article patterns
  const nonArticlePatterns = [
    /^404/i,
    /not found/i,
    /access denied/i,
    /login required/i,
    /subscribe to/i,
    /cookie policy/i,
    /privacy policy/i,
    /terms of service/i
  ];
  
  const lowerText = text.toLowerCase();
  for (const pattern of nonArticlePatterns) {
    if (pattern.test(lowerText)) return false;
  }
  
  return true;
}

async function extractArticle(
  searchResult: SearchResult,
  fetchDir: string,
  extractedDir: string
): Promise<ExtractedArticle | null> {
  const hash = hashUrl(searchResult.url);
  const extractedPath = path.join(extractedDir, `${hash}.json`);

  // Check cache
  try {
    const cached = JSON.parse(await fs.readFile(extractedPath, 'utf-8'));
    return cached;
  } catch {
    // Continue to extract
  }

  // Fetch HTML
  const html = await fetchHtml(searchResult.url, fetchDir);
  if (!html) {
    return null;
  }

  // Extract text
  const { text, title: extractedTitle, author, date } = extractText(html, searchResult.url);
  
  // Use search result title if extracted title is too short
  const finalTitle = extractedTitle.length > 10 ? extractedTitle : searchResult.title;
  
  // Count words
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  
  // Validate
  if (!isEnglish(text)) {
    console.warn(`[Extract] Non-English content: ${searchResult.url}`);
    return null;
  }
  
  if (!isArticle(text, wordCount)) {
    console.warn(`[Extract] Not an article (${wordCount} words): ${searchResult.url}`);
    return null;
  }

  const extracted: ExtractedArticle = {
    url: searchResult.url,
    title: finalTitle,
    snippet: searchResult.snippet,
    domain: searchResult.domain,
    publishedDate: date || searchResult.publishedDate,
    extractedText: text.substring(0, 5000), // Limit extracted text length
    wordCount,
    author,
    hash
  };

  // Save to cache
  await fs.mkdir(extractedDir, { recursive: true });
  await fs.writeFile(extractedPath, JSON.stringify(extracted, null, 2), 'utf-8');

  return extracted;
}

export async function fetchAndExtractArticles(
  searchResults: SearchResult[],
  discoveryDir: string
): Promise<ExtractedArticle[]> {
  const candidatesPath = path.join(discoveryDir, 'candidates.json');
  const fetchDir = path.join(discoveryDir, 'fetch');
  const extractedDir = path.join(discoveryDir, 'extracted');

  // Check if candidates already exist
  try {
    const existing = JSON.parse(await fs.readFile(candidatesPath, 'utf-8'));
    console.log(`[Extract] Using cached candidates from ${candidatesPath}`);
    return existing;
  } catch {
    // Continue to extract
  }

  const extracted: ExtractedArticle[] = [];

  for (let i = 0; i < searchResults.length; i++) {
    const result = searchResults[i];
    console.log(`[Extract] Processing ${i + 1}/${searchResults.length}: ${result.title.substring(0, 50)}...`);
    
    const article = await extractArticle(result, fetchDir, extractedDir);
    if (article) {
      extracted.push(article);
    }
    
    // Rate limiting
    if (i < searchResults.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Save candidates
  await fs.mkdir(discoveryDir, { recursive: true });
  await fs.writeFile(candidatesPath, JSON.stringify(extracted, null, 2), 'utf-8');

  return extracted;
}

