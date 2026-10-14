/**
 * Article translation utility for digest localization.
 *
 * Uses OpenAI to translate article titles + summaries into DA/ES.
 * Implements hash-based caching to avoid re-translating unchanged content.
 *
 * Cache location: data/cache/article-translations.json
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import type { ArticleTranslations } from './types';
import { getModelFor, maxTokensParam, temperatureParam, getReasoningFor, reasoningParam } from '../llm/models';

const TRANSLATE_MODEL_PRIMARY = getModelFor('classify');
// A different model from the primary (Luna since 2026-10-14), so a fallback
// is a real second opinion. gpt-4.1-mini until then; removed 2027-01-14.
const TRANSLATE_MODEL_FALLBACK = process.env.TRANSLATE_MODEL_FALLBACK || 'gpt-6.1-sol';
const MAX_OUTPUT_TOKENS = 400;
const TEMPERATURE = 0.3;

const CACHE_PATH = path.join(process.cwd(), 'data', 'cache', 'article-translations.json');

type CacheEntry = {
  da: { title: string; summary: string };
  es: { title: string; summary: string };
  translatedAt: string;
};

type TranslationCache = Record<string, CacheEntry>;

/**
 * Compute a stable hash for an article's translatable content.
 */
function contentHash(title: string, summary: string): string {
  return createHash('sha256')
    .update(`${title}||${summary}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Load translation cache from disk.
 */
async function loadCache(): Promise<TranslationCache> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as TranslationCache;
  } catch {
    return {};
  }
}

/**
 * Save translation cache to disk.
 */
async function saveCache(cache: TranslationCache): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

type TranslationResult = {
  da: { title: string; summary: string };
  es: { title: string; summary: string };
};

/**
 * Translate a single article's title + summary into DA and ES using OpenAI.
 * Tries primary model first, falls back to fallback model if primary fails or returns empty.
 */
async function translateSingle(
  title: string,
  summary: string
): Promise<TranslationResult | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error('[Translate] OPENAI_API_KEY not set — skipping translation');
    return null;
  }

  const prompt = `Translate the following article title and summary into Danish (da) and Spanish (es).
Return ONLY valid JSON with this exact structure (no markdown, no backticks):
{
  "da": { "title": "...", "summary": "..." },
  "es": { "title": "...", "summary": "..." }
}

Title: "${title}"
Summary: "${summary || '(no summary available)'}"

Rules:
- Keep brand names, product names, and proper nouns untranslated.
- Keep the translation concise and natural.
- If summary is "(no summary available)", set summary to an empty string "".
- Do NOT add any explanation, just the JSON.`;

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  let currentModel = TRANSLATE_MODEL_PRIMARY;
  let modelUsed = '';

  // Try primary model, then fallback
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model: currentModel,
        ...temperatureParam(currentModel, TEMPERATURE),
        // The classify effort is tuned for the primary; the fallback runs at its own default.
        ...reasoningParam(currentModel, currentModel === TRANSLATE_MODEL_PRIMARY ? getReasoningFor('classify') : undefined),
        ...maxTokensParam(currentModel, MAX_OUTPUT_TOKENS),
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      const raw = res.choices[0]?.message?.content?.trim();
      if (!raw) {
        if (attempt === 0) {
          // Empty response from primary — try fallback
          currentModel = TRANSLATE_MODEL_FALLBACK;
          if (currentModel !== TRANSLATE_MODEL_PRIMARY) {
            console.log(`[Translate] Empty response from [${TRANSLATE_MODEL_PRIMARY}], trying fallback [${TRANSLATE_MODEL_FALLBACK}]`);
          }
          continue;
        }
        return null;
      }

      // Strip markdown fences if present
      const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(jsonStr) as TranslationResult;

      // Basic validation
      if (!parsed.da?.title || !parsed.es?.title) {
        if (attempt === 0) {
          // Invalid structure from primary — try fallback
          currentModel = TRANSLATE_MODEL_FALLBACK;
          if (currentModel !== TRANSLATE_MODEL_PRIMARY) {
            console.log(`[Translate] Invalid structure from [${TRANSLATE_MODEL_PRIMARY}], trying fallback [${TRANSLATE_MODEL_FALLBACK}]`);
          }
          continue;
        }
        console.warn('[Translate] Invalid translation structure — missing title fields');
        return null;
      }

      modelUsed = currentModel;
      if (attempt > 0 && currentModel !== TRANSLATE_MODEL_PRIMARY) {
        console.log(`[Translate] Successfully used fallback model [${TRANSLATE_MODEL_FALLBACK}]`);
      }

      return parsed;
    } catch (e: any) {
      if (attempt === 0) {
        // Error from primary — try fallback
        console.log(`[Translate] LLM call failed [${TRANSLATE_MODEL_PRIMARY}]: ${e?.message || 'Unknown error'}`);
        currentModel = TRANSLATE_MODEL_FALLBACK;
        if (currentModel !== TRANSLATE_MODEL_PRIMARY) {
          console.log(`[Translate] Trying fallback model [${TRANSLATE_MODEL_FALLBACK}]`);
        }
        continue;
      }
      // Both attempts failed
      console.error(`[Translate] Error translating "${title.substring(0, 50)}...":`, e?.message);
      return null;
    }
  }

  return null;
}

type ArticleToTranslate = {
  title: string;
  aiSummary?: string | null;
};

type TranslateDigestStats = {
  total: number;
  cached: number;
  translated: number;
  failed: number;
};

/**
 * Translate all top articles in a digest into DA and ES.
 * Uses hash-based cache to skip unchanged content.
 * Returns the translations map keyed by article title (for attachment to articles).
 */
export async function translateDigestArticles(
  articles: ArticleToTranslate[]
): Promise<{ translations: Map<string, ArticleTranslations>; stats: TranslateDigestStats }> {
  const cache = await loadCache();
  const translations = new Map<string, ArticleTranslations>();
  const stats: TranslateDigestStats = { total: articles.length, cached: 0, translated: 0, failed: 0 };

  // Batch: identify which need translation
  const toTranslate: Array<{ article: ArticleToTranslate; hash: string }> = [];

  for (const article of articles) {
    const summary = article.aiSummary || '';
    const hash = contentHash(article.title, summary);

    if (cache[hash]) {
      // Cache hit — reuse
      translations.set(article.title, {
        da: cache[hash].da,
        es: cache[hash].es,
      });
      stats.cached++;
    } else {
      toTranslate.push({ article, hash });
    }
  }

  // Translate uncached articles (with concurrency limit)
  const BATCH_SIZE = 5;
  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ article, hash }) => {
        const result = await translateSingle(article.title, article.aiSummary || '');
        return { article, hash, result };
      })
    );

    for (const { article, hash, result } of results) {
      if (result) {
        cache[hash] = {
          da: result.da,
          es: result.es,
          translatedAt: new Date().toISOString(),
        };
        translations.set(article.title, {
          da: result.da,
          es: result.es,
        });
        stats.translated++;
      } else {
        stats.failed++;
      }
    }
  }

  // Persist cache
  if (stats.translated > 0) {
    await saveCache(cache);
  }

  return { translations, stats };
}
