/**
 * Generate "The Week in Context" (internal name: editorialTake), the short
 * explainer that opens the weekly digest. Since 2026-11-09 (owner decision,
 * docs/pipeline-decisions.md) it is written in a neutral voice: no persona, no
 * first or second person, no advice to an unnamed operator, plain language.
 *
 * Variety: the model picks one of six formats (takeChecks.ts TAKE_FORMATS),
 * excluding the formats used in the previous 2 published weeks, and sees the
 * previous 3 takes as examples of what not to repeat. Code checks
 * (takeChecks.ts: pronouns, banned phrases, repeated opening, jargon,
 * readability) feed one rewrite pass; a take is never dropped for style.
 *
 * Only the week being built is generated. A legacy take (an existing digest
 * file with editorialTake and no editorialTakeFormat) is kept on a rebuild, so
 * bumping TAKE_VERSION does not rewrite past digests. Only an explicit
 * regenTake=true (scripts/regenEditorialTake.ts) replaces it.
 *
 * Supports an override flag: if editorialTakeOverride is set in the digest JSON,
 * the pipeline will NOT overwrite the editorialTake field on rebuild.
 * To regenerate a manually overridden take: pass regenTake=true, or delete
 * editorialTakeOverride from the digest JSON before rebuilding.
 */

import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import type { WeeklyDigest } from './buildWeeklyDigest';
import { getTopicDisplayName } from '../lib/utils/topicNames';
import { readJsonCache, writeJsonCache } from '../lib/utils/cachePaths';
import { getModelFor, maxTokensParam, temperatureParam } from '../lib/llm/models';
import { HOUSE_STYLE_RULES, stripDashes } from '../lib/llm/houseStyle';
import {
  TAKE_FORMATS,
  allowedFormats,
  findTakeProblems,
  formatProblem,
  isTakeFormat,
  wordCount,
  type TakeFormatId,
} from './takeChecks';

// ── Configuration ─────────────────────────────────────────────────────────────
// The strongest model we route to: this is the page's original content
// (roadmap F3.1, 2026-09-18).
const TAKE_MODEL = process.env.EDITORIAL_TAKE_MODEL || getModelFor('polish');
const TEMPERATURE = 0.5; // some range, so the formats and openings really differ week to week
const MAX_TOKENS = 700;
const CACHE_KIND = 'editorial-take';
// Length history (owner decisions): 250–300 words (F3.1, 2026-09-18) →
// 150–180 ("too chunky", 2026-09-21) → 120–130 (2026-10-09) → 80–140 words in
// 2 to 4 paragraphs (2026-11-09, with the new neutral voice).
const TAKE_VERSION = '4.0';
const TARGET_MIN_WORDS = 80;
const TARGET_MAX_WORDS = 140;
const MIN_WORDS = 70; // below this, one fresh attempt, then give up
const MAX_WORDS = 150; // above this, one condensing pass (see condenseTake)
const MIN_PARAGRAPHS = 2;
const MAX_PARAGRAPHS = 4;
const EXCLUDE_LAST_FORMATS = 2; // formats used in the previous 2 published weeks are off limits
const SHOW_PREVIOUS_TAKES = 3; // previous takes shown in the prompt
const OPENING_CHECK_TAKES = 4; // previous takes checked for a repeated opening

const TOPIC_KEYS = ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'] as const;

// ── Types ─────────────────────────────────────────────────────────────────────
export type TakeResult = {
  editorialTake: string;
  /** Null only when the model never returned a known format. */
  format: TakeFormatId | null;
};

/** An earlier published take. `format` is absent on takes from before v4.0. */
export type PriorTake = {
  weekLabel: string;
  text: string;
  format?: string | null;
};

type CacheEntry = {
  editorialTake: string;
  format?: TakeFormatId | null;
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
  for (const key of TOPIC_KEYS) {
    for (const article of digest.topics[key]?.top ?? []) {
      if (article.url) urls.push(article.url);
    }
  }
  return crypto.createHash('md5').update(JSON.stringify(urls.sort())).digest('hex').slice(0, 12);
}

function getCacheKey(weekLabel: string, digest: WeeklyDigest): string {
  return `${weekLabel}:${fingerprintDigest(digest)}`;
}

// ── History ───────────────────────────────────────────────────────────────────
const DIGESTS_DIR = path.join(process.cwd(), 'data', 'digests');

/**
 * The last `count` published takes before `weekLabel`, oldest first. Weeks
 * without a take are skipped. Labels sort as text (YYYY-Www), also across years.
 */
export async function loadPreviousTakes(
  weekLabel: string,
  count = OPENING_CHECK_TAKES,
  dir = DIGESTS_DIR,
): Promise<PriorTake[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const labels = files
    .map(f => f.match(/^(\d{4}-W\d{2})\.json$/)?.[1])
    .filter((l): l is string => Boolean(l) && l! < weekLabel)
    .sort();
  const found: PriorTake[] = [];
  for (const label of labels.reverse()) {
    if (found.length >= count) break;
    try {
      const d = JSON.parse(await fs.readFile(path.join(dir, `${label}.json`), 'utf-8'));
      if (typeof d.editorialTake === 'string' && d.editorialTake.trim()) {
        found.push({ weekLabel: label, text: d.editorialTake.trim(), format: d.editorialTakeFormat ?? null });
      }
    } catch {
      // unreadable digest: skip it
    }
  }
  return found.reverse();
}

/** Formats used in the last EXCLUDE_LAST_FORMATS published takes. */
export function excludedFormatsFrom(history: ReadonlyArray<PriorTake>): string[] {
  return history.slice(-EXCLUDE_LAST_FORMATS).map(t => t.format).filter((f): f is string => Boolean(f));
}

// ── Prompt builder ────────────────────────────────────────────────────────────
export function buildEditorialTakePrompt(digest: WeeklyDigest, history: ReadonlyArray<PriorTake> = []): string {
  const articleLines: string[] = [];
  for (const key of TOPIC_KEYS) {
    const topic = digest.topics[key];
    if (!topic?.top?.length) continue;
    articleLines.push(`\n[${getTopicDisplayName(key)}]`);
    // The full week, not a sample: the model needs to see every story to find
    // the two that connect, the figure that matters or the dated event.
    for (const article of topic.top) {
      const summary = article.aiSummary || article.snippet || '';
      articleLines.push(`- ${article.title} (${article.source})${summary ? `: ${summary.slice(0, 160)}` : ''}`);
    }
  }

  const weeklyInsight = digest.oneSentenceSummary || '';
  const themes = digest.keyThemes?.length ? digest.keyThemes.join(' · ') : '';
  const excluded = excludedFormatsFrom(history);
  const allowed = allowedFormats(excluded);
  const formatLines = TAKE_FORMATS.filter(f => allowed.includes(f.id)).map(f => `- ${f.id}: ${f.description}`).join('\n');
  const previous = history.slice(-SHOW_PREVIOUS_TAKES);
  const previousBlock = previous.length
    ? `PREVIOUS WEEKS (do not reuse their opening words, sentence patterns or endings; some are in an older style that is no longer allowed):\n${previous
        .map(t => `[${t.weekLabel}${t.format ? `, format: ${t.format}` : ''}]\n${t.text}`)
        .join('\n\n')}`
    : '';

  return `Write "The Week in Context" for a weekly news brief read by people who work in luxury, jewellery and ecommerce. It explains what happened this week and why it matters, the way a good news brief does. It is written by software, so it has no author's voice and no persona.

THIS WEEK'S SELECTED STORIES:
${articleLines.join('\n')}

${weeklyInsight ? `THIS WEEK'S ONE-LINE INSIGHT (already on the page, do not repeat it verbatim): ${weeklyInsight}` : ''}
${themes ? `KEY THEMES: ${themes}` : ''}

${previousBlock}

CHOOSE ONE FORMAT that fits this week's stories best. Allowed formats:
${formatLines}
${excluded.length ? `Not allowed this week (used in the previous weeks): ${excluded.join(', ')}.` : ''}
Use "watch" only if the stories contain a dated upcoming event or decision. Only "watch" may end on something forward-looking. Every other format stops when the point is made: no closing recommendation, no advice, no summary line.

CONTENT RULES:
- Use only facts from the stories above. Invent nothing. Name the companies and the numbers.
- Open with a company, a number or an event. Never open with the writer, "this week" or "Luxury brands should".
- Never use first or second person: no I, me, my, we, our, us, you, your. No advice aimed at brands, operators or retailers.
- Plain language. Sentences average about 15 words or fewer. Everyday words. A concrete subject and verb in every sentence. One idea per sentence. If a trade term cannot be avoided, explain it in the same sentence.
- No consulting or ecommerce jargon (the banned list is below). Say what actually happens.
- Never mention Pandora or any employer. No references to "the digest", "the articles" or "the stories".
- No em dashes (use commas or colons or full stops).

LENGTH: ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS} words in ${MIN_PARAGRAPHS} to ${MAX_PARAGRAPHS} short paragraphs separated by a blank line. No headers, bullets or labels.

STYLE REFERENCE (a "split" take for another week; show the same plainness, but do not copy its sentences or structure unless your format is "split"):
"TikTok and Walmart both want shoppers to buy without leaving their apps. TikTok launched a separate Shop app with its own deals and checkout. Walmart's assistant, Sparky, can now recognise products from a photo and fill a shopping cart.

Palace went the other way. Its Burberry collection is sold only in its stores.

The two paths trade off differently for luxury brands. Selling inside an app reaches more shoppers, but the app owns the checkout. Selling only in stores keeps the buyer close, but fewer people find the product."

${HOUSE_STYLE_RULES}

Respond as JSON:
{
  "format": "<one allowed format id>",
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
  return stripDashes(text)
    .split(/\n\s*\n/)
    .map(p => p.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function paragraphCount(text: string): number {
  return text.split(/\n\s*\n/).filter(p => p.trim()).length;
}

/**
 * The model reliably overshoots a word range in a long generative prompt, but
 * follows a pure "cut this to N words" edit well. One pass, same model,
 * temperature 0; returns null on any failure so the caller keeps the original.
 */
async function condenseTake(openai: OpenAI, text: string): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: TAKE_MODEL,
      ...temperatureParam(TAKE_MODEL, 0),
      ...maxTokensParam(TAKE_MODEL, MAX_TOKENS),
      messages: [{
        role: 'user',
        content: `Cut this short news explainer to ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS} words. Keep the paragraph count (${MIN_PARAGRAPHS} to ${MAX_PARAGRAPHS} paragraphs separated by a blank line), the opening, and every company name and number that remains load-bearing. Keep the neutral voice: no first or second person, no advice. Keep sentences short and words plain. Remove repetition and any sentence that restates an earlier point. Do not add anything new. No em dashes.

Respond as JSON: {"editorialTake": "..."}

TEXT:
${text}`,
      }],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;
    const parsed = JSON.parse(content);
    return typeof parsed.editorialTake === 'string' ? normalizeTakeText(parsed.editorialTake) : null;
  } catch {
    return null;
  }
}

/** One pass that fixes only the listed problems. Null on failure. */
async function fixTakeStyle(openai: OpenAI, text: string, problems: string[], avoidOpenings: string[]): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: TAKE_MODEL,
      ...temperatureParam(TAKE_MODEL, 0),
      ...maxTokensParam(TAKE_MODEL, MAX_TOKENS),
      messages: [{
        role: 'user',
        content: `Edit this short news explainer to fix these problems, and change nothing else: ${problems.join('; ')}.
Keep the paragraph count, the neutral voice (no first or second person, no advice), the point, and every fact. Keep it ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS} words. Use short sentences (about 15 words) and everyday words.
${avoidOpenings.length ? `Do not open with the same first words as these earlier texts:\n${avoidOpenings.map(o => `- ${o}`).join('\n')}\n` : ''}
${HOUSE_STYLE_RULES}

Respond as JSON: {"editorialTake": "..."}

TEXT:
${text}`,
      }],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;
    const parsed = JSON.parse(content);
    return typeof parsed.editorialTake === 'string' ? normalizeTakeText(parsed.editorialTake) : null;
  } catch {
    return null;
  }
}

// ── LLM call ──────────────────────────────────────────────────────────────────
type Candidate = { text: string; format: TakeFormatId | null; words: number; structural: string[] };

/** Length, paragraph and format problems that earn a fresh attempt. */
function structuralProblems(text: string, format: unknown, excluded: string[]): string[] {
  const out: string[] = [];
  const words = wordCount(text);
  if (words < MIN_WORDS) out.push(`too short (${words} words, need ${MIN_WORDS} or more)`);
  const paras = paragraphCount(text);
  if (paras < MIN_PARAGRAPHS || paras > MAX_PARAGRAPHS) out.push(`${paras} paragraphs, need ${MIN_PARAGRAPHS} to ${MAX_PARAGRAPHS}`);
  const fp = formatProblem(format, excluded);
  if (fp) out.push(fp);
  return out;
}

/**
 * Generate one take from `history` (earlier takes, oldest first). No cache, no
 * file I/O: the caller decides what to store. Exported for the dry-run script.
 */
export async function generateTake(
  digest: WeeklyDigest,
  history: ReadonlyArray<PriorTake>,
): Promise<(TakeResult & { problems: string[] }) | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[EditorialTake] OPENAI_API_KEY not set, skipping');
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = buildEditorialTakePrompt(digest, history);
    const excluded = excludedFormatsFrom(history);
    const previousTexts = history.slice(-OPENING_CHECK_TAKES).map(t => t.text);

    // A too-short answer, an unknown or excluded format, or a paragraph count
    // outside 2-4 gets one fresh attempt. Returning null leaves the page
    // without a take, so keep the best candidate rather than give up.
    let best: Candidate | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await openai.chat.completions.create({
        model: TAKE_MODEL,
        ...temperatureParam(TAKE_MODEL, TEMPERATURE),
        ...maxTokensParam(TAKE_MODEL, MAX_TOKENS),
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content?.trim();
      const parsed = content ? JSON.parse(content) : {};
      const text = normalizeTakeText(typeof parsed.editorialTake === 'string' ? parsed.editorialTake : '');
      const format = isTakeFormat(parsed.format) ? parsed.format : null;
      const structural = structuralProblems(text, parsed.format, excluded);
      const cand: Candidate = { text, format, words: wordCount(text), structural };
      // Prefer a candidate that is long enough, then the one with fewer structural problems.
      const rank = (c: Candidate) => (c.words >= MIN_WORDS ? 0 : 100) + c.structural.length;
      if (!best || rank(cand) < rank(best)) best = cand;
      if (!structural.length) break;
      console.warn(`[EditorialTake] Attempt ${attempt} of 2: ${structural.join('; ')}`);
    }
    if (!best || best.words < MIN_WORDS) return null;

    let editorialTake = best.text;
    const format = best.format;

    // Take-only checks plus house style. One targeted rewrite; kept only if it
    // has fewer problems and is still long enough. Never dropped for style.
    let problems = findTakeProblems(editorialTake, previousTexts);
    if (problems.length) {
      console.warn(`[EditorialTake] Problems: ${problems.join('; ')}. Rewriting once...`);
      const openings = previousTexts.map(t => t.split(/\s+/).slice(0, 6).join(' '));
      const fixed = await fixTakeStyle(openai, editorialTake, problems, openings);
      if (fixed && wordCount(fixed) >= MIN_WORDS) {
        const fixedProblems = findTakeProblems(fixed, previousTexts);
        if (fixedProblems.length < problems.length) {
          editorialTake = fixed;
          problems = fixedProblems;
        } else {
          console.warn('[EditorialTake] Rewrite did not help; keeping the original');
        }
      }
    }

    let words = wordCount(editorialTake);
    if (words > MAX_WORDS) {
      console.warn(`[EditorialTake] Response long (${words} words); condensing...`);
      const condensed = await condenseTake(openai, editorialTake);
      const condensedWords = condensed ? wordCount(condensed) : 0;
      if (condensed && condensedWords >= MIN_WORDS && condensedWords < words) {
        console.log(`[EditorialTake] Condensed ${words} → ${condensedWords} words`);
        editorialTake = condensed;
        words = condensedWords;
        problems = findTakeProblems(editorialTake, previousTexts);
      } else {
        console.warn(`[EditorialTake] Condensing did not help (${condensedWords} words); keeping original`);
      }
    }

    if (problems.length) console.warn(`[EditorialTake] Shipping with remaining problems: ${problems.join('; ')}`);
    return { editorialTake, format, problems };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[EditorialTake] LLM call failed: ${msg}`);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Generate The Week in Context for a weekly digest with caching.
 *
 * Returns null (and generates nothing) if:
 *   - digest.editorialTakeOverride is true (manual edit protection)
 *   - OPENAI_API_KEY is not set
 *
 * A legacy take (existing digest file with editorialTake and no
 * editorialTakeFormat) is returned unchanged unless regenTake=true, so a
 * rebuild of an old week, or a TAKE_VERSION bump, never rewrites it.
 * Pass regenTake=true to bypass the cache and that guard (the override flag
 * is still respected).
 */
export async function generateEditorialTakeForDigest(
  digest: WeeklyDigest,
  regenTake = false,
): Promise<TakeResult | null> {
  // Respect manual override flag: never clobber the owner's own text
  if (digest.editorialTakeOverride) {
    console.log(`[EditorialTake] Override flag set for ${digest.weekLabel}, skipping generation`);
    return null;
  }

  if (!regenTake) {
    try {
      const existing = JSON.parse(await fs.readFile(path.join(DIGESTS_DIR, `${digest.weekLabel}.json`), 'utf-8'));
      if (typeof existing.editorialTake === 'string' && existing.editorialTake.trim() && !existing.editorialTakeFormat) {
        console.log(`[EditorialTake] ${digest.weekLabel} has a published take from before v4.0, keeping it`);
        return { editorialTake: existing.editorialTake, format: null };
      }
    } catch {
      // no existing digest: a new week
    }
  }

  const cache = await loadCache();
  const cacheKey = getCacheKey(digest.weekLabel, digest);

  if (!regenTake) {
    const cached = cache[cacheKey];
    if (cached && cached.version === TAKE_VERSION && cached.model === TAKE_MODEL) {
      console.log(`[EditorialTake] Cache hit for ${digest.weekLabel}`);
      return { editorialTake: cached.editorialTake, format: cached.format ?? null };
    }
  }

  console.log(`[EditorialTake] Generating take for ${digest.weekLabel}...`);
  const history = await loadPreviousTakes(digest.weekLabel);
  const result = await generateTake(digest, history);

  if (!result) {
    console.warn(`[EditorialTake] Generation failed for ${digest.weekLabel}`);
    return null;
  }

  cache[cacheKey] = {
    editorialTake: result.editorialTake,
    format: result.format,
    cached_at: new Date().toISOString(),
    model: TAKE_MODEL,
    version: TAKE_VERSION,
  };
  await saveCache(cache);

  console.log(`[EditorialTake] ✓ Generated for ${digest.weekLabel} (format: ${result.format ?? 'unknown'})`);
  return { editorialTake: result.editorialTake, format: result.format };
}
