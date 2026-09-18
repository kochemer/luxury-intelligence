/**
 * Generate the weekly Editor's Take — a first-person, opinionated editorial
 * commentary for the weekly digest. Designed to feel human and analytical,
 * not like an automated summary.
 *
 * Supports an override flag: if editorialTakeOverride is set in the digest JSON,
 * the pipeline will NOT overwrite the editorialTake field on rebuild. This lets
 * the editor manually tweak the text after generation without losing it.
 *
 * To regenerate a manually overridden take: pass regenTake=true, or delete
 * editorialTakeOverride from the digest JSON before rebuilding.
 */

import crypto from 'crypto';
import OpenAI from 'openai';
import type { WeeklyDigest } from './buildWeeklyDigest';
import { getTopicDisplayName } from '../lib/utils/topicNames';
import { readJsonCache, writeJsonCache } from '../lib/utils/cachePaths';
import { getModelFor, maxTokensParam, temperatureParam } from '../lib/llm/models';

// ── Configuration ─────────────────────────────────────────────────────────────
// The strongest model we route to: this is the page's original content and
// the argument it opens with (roadmap F3.1, 2026-09-18).
const TAKE_MODEL = process.env.EDITORIAL_TAKE_MODEL || getModelFor('polish');
const TEMPERATURE = 0.4; // Slightly higher than summaries — we want voice, not determinism
const MAX_TOKENS = 800;
const CACHE_KIND = 'editorial-take';
const TAKE_VERSION = '2.0'; // 250–300 words, thesis + evidence + operator implication
const MIN_WORDS = 180;
const MAX_WORDS = 340;

// ── Types ─────────────────────────────────────────────────────────────────────
type TakeResult = {
  editorialTake: string;
};

type CacheEntry = {
  editorialTake: string;
  cached_at: string;
  model: string;
  version: string;
};

type TakeCache = {
  [key: string]: CacheEntry;
};

// ── Cache helpers ─────────────────────────────────────────────────────────────
async function loadCache(): Promise<TakeCache> {
  return (await readJsonCache<TakeCache>(CACHE_KIND)) || {};
}

async function saveCache(cache: TakeCache): Promise<void> {
  try {
    await writeJsonCache(CACHE_KIND, cache);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[EditorialTake] Failed to save cache: ${msg}`);
  }
}

function fingerprintDigest(digest: WeeklyDigest): string {
  const urls: string[] = [];
  for (const key of ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'] as const) {
    for (const article of digest.topics[key]?.top ?? []) {
      if (article.url) urls.push(article.url);
    }
  }
  return crypto.createHash('md5').update(JSON.stringify(urls.sort())).digest('hex').slice(0, 12);
}

function getCacheKey(weekLabel: string, digest: WeeklyDigest): string {
  return `${weekLabel}:${fingerprintDigest(digest)}`;
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildEditorialTakePrompt(digest: WeeklyDigest): string {
  const topicKeys = ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'] as const;

  const articleLines: string[] = [];
  for (const key of topicKeys) {
    const topic = digest.topics[key];
    if (!topic?.top?.length) continue;
    const topicName = getTopicDisplayName(key);
    articleLines.push(`\n[${topicName}]`);
    // The full week, not a sample: the take must draw evidence from at least
    // three selected stories, so the model needs to see all of them.
    for (const article of topic.top) {
      const summary = article.aiSummary || article.snippet || '';
      articleLines.push(`- ${article.title} (${article.source})${summary ? `: ${summary.slice(0, 160)}` : ''}`);
    }
  }

  const weeklyInsight = digest.oneSentenceSummary || '';
  const themes = digest.keyThemes?.length ? digest.keyThemes.join(' · ') : '';

  return `You are the editor of a weekly intelligence digest read by people who run luxury and jewellery businesses: brand strategy, merchandising, ecommerce, competitive intelligence. Your background is in management consulting and ecommerce strategy.

Write this week's Editor's Take: the column that opens the issue. It is the one piece of original argument on the page. A reader who reads nothing else should come away with a point of view they did not have before.

THIS WEEK'S SELECTED STORIES:
${articleLines.join('\n')}

${weeklyInsight ? `THIS WEEK'S ONE-LINE INSIGHT (already on the page, do not repeat it verbatim): ${weeklyInsight}` : ''}
${themes ? `KEY THEMES: ${themes}` : ''}

STRUCTURE (three or four paragraphs, 250-300 words total):
1. THESIS. Open with the claim: the one thing this week's evidence actually shows. A specific, arguable statement, stated in the first sentence.
2. EVIDENCE. Build the case from at least THREE of the stories above, named explicitly (company, number, decision). Show how they connect; do not list them. Every fact must come from the stories above; invent nothing.
3. COUNTER. One sentence on the strongest objection to your thesis, and why it does not hold, or what would have to be true for it to hold.
4. IMPLICATION. Close with what a luxury or jewellery operator should do differently, or watch for, in the next quarter because of this. Concrete, not "stay alert". If the week's evidence is mostly about AI or ecommerce, this paragraph is where you make it matter for luxury and jewellery specifically.

FORMAT:
- 250-300 words. Three or four paragraphs separated by a blank line (\n\n).
- No headers. No bullet points. No numbered lists. No labels like "Thesis:".

WRITING STYLE:
- Short sentences. Vary rhythm. No padding.
- Reads like a smart human wrote it at 8am, not like a press release or a blog post.
- Direct and specific. Never hedging with "may", "could", "might suggest".

STRICT BANS (any violation makes this unusable):
- NEVER mention Pandora or any employer
- NO "this week" as an opener
- NO em-dashes (use commas or colons instead)
- NO: "groundbreaking", "transformative", "revolutionary", "significant", "exciting", "fascinating", "notable", "interesting", "landscape", "ecosystem", "it remains to be seen"
- NO meta-references to "this digest", "the articles", "the stories above"
- NO filler openers like "What I find...", "There's something...", "It's worth noting..."
- DO write in first person: "I", "my", "what I think..."

Format your response as JSON:
{
  "editorialTake": "Paragraph one here.\\n\\nParagraph two here."
}`;
}

/**
 * House style the model will not reliably follow on its own: no em/en dashes
 * (27 of 38 regenerated takes used them despite the prompt's ban). A dash
 * between clauses becomes a comma; a dash opening a list or an explanation
 * becomes a colon. Also collapses whitespace inside paragraphs.
 */
export function normalizeTakeText(text: string): string {
  return text
    // Every dash becomes a comma. A colon would read better before an
    // enumeration, but telling the two cases apart reliably is not worth the
    // complexity; consistent beats clever here.
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+([,.;:])/g, '$1')
    .split(/\n\s*\n/)
    .map(p => p.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

// ── LLM call ──────────────────────────────────────────────────────────────────
async function callLLMForEditorialTake(digest: WeeklyDigest): Promise<TakeResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[EditorialTake] OPENAI_API_KEY not set, skipping');
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = buildEditorialTakePrompt(digest);

    const response = await openai.chat.completions.create({
      model: TAKE_MODEL,
      ...temperatureParam(TAKE_MODEL, TEMPERATURE),
      ...maxTokensParam(TAKE_MODEL, MAX_TOKENS),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content);
    const editorialTake = normalizeTakeText(typeof parsed.editorialTake === 'string' ? parsed.editorialTake : '');
    const words = editorialTake.split(/\s+/).filter(Boolean).length;
    if (!editorialTake || words < MIN_WORDS) {
      console.warn(`[EditorialTake] Response too short (${words} words, need ≥${MIN_WORDS}), discarding`);
      return null;
    }
    if (words > MAX_WORDS) {
      console.warn(`[EditorialTake] Response long (${words} words, target ≤300); keeping`);
    }

    return { editorialTake };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[EditorialTake] LLM call failed: ${msg}`);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Generate the Editor's Take for a weekly digest with caching.
 *
 * Will skip generation and return null if:
 *   - digest.editorialTakeOverride is true (manual edit protection)
 *   - OPENAI_API_KEY is not set
 *
 * Pass regenTake=true to bypass cache (but still respects the override flag).
 */
export async function generateEditorialTakeForDigest(
  digest: WeeklyDigest,
  regenTake = false,
): Promise<TakeResult | null> {
  // Respect manual override flag — never clobber editor's own text
  if (digest.editorialTakeOverride) {
    console.log(`[EditorialTake] Override flag set for ${digest.weekLabel}, skipping generation`);
    return null;
  }

  const cache = await loadCache();
  const cacheKey = getCacheKey(digest.weekLabel, digest);

  if (!regenTake) {
    const cached = cache[cacheKey];
    if (cached && cached.version === TAKE_VERSION && cached.model === TAKE_MODEL) {
      console.log(`[EditorialTake] Cache hit for ${digest.weekLabel}`);
      return { editorialTake: cached.editorialTake };
    }
  }

  console.log(`[EditorialTake] Generating editorial take for ${digest.weekLabel}...`);
  const result = await callLLMForEditorialTake(digest);

  if (!result) {
    console.warn(`[EditorialTake] Generation failed for ${digest.weekLabel}`);
    return null;
  }

  cache[cacheKey] = {
    editorialTake: result.editorialTake,
    cached_at: new Date().toISOString(),
    model: TAKE_MODEL,
    version: TAKE_VERSION,
  };
  await saveCache(cache);

  console.log(`[EditorialTake] ✓ Generated for ${digest.weekLabel}`);
  return result;
}
