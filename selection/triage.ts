/**
 * Stage 3: LLM triage (cheap model, every article that passed stage 1).
 * Spec §3. Assigns category (or null), type, significance 1-5, ad risk.
 *
 * Batches of 40, concurrency 4. JSON validated per row; rows that are missing or
 * invalid get one retry (as a fresh smaller batch), then a per-article fallback
 * (classifier category, type other, significance 2, adRisk low, fallback: true).
 */
import OpenAI from 'openai';
import type { Article, Topic } from '../lib/types';
import { maxTokensParam, reasoningParam, temperatureParam } from '../lib/llm/models';
import { readJsonCache, writeJsonCache } from '../lib/utils/cachePaths';
import { createChatCompletion, type TierUsage } from './serviceTier';
import { PEER_RESULTS_RULE, UNTRUSTED_NOTICE, type AdRisk, type ArticleType, type HardFilterResult, type TriageResult } from './types';

/** Bump to invalidate the triage cache (prompt or rubric change). */
export const TRIAGE_PROMPT_VERSION = 'triage-v4';
export const TRIAGE_BATCH_SIZE = 40;
export const TRIAGE_CONCURRENCY = 4;
export const TRIAGE_CACHE_KIND = 'selection_triage';
export const TRIAGE_CACHE_WEEKS = 8;
export const DEFAULT_TRIAGE_MODEL = 'gpt-6-luna';

export const TOPIC_VALUES: Topic[] = ['AI_and_Strategy', 'Ecommerce_Retail_Tech', 'Luxury_and_Consumer', 'Jewellery_Industry'];
export const TYPE_VALUES: ArticleType[] = [
  'hard_news',
  'analysis',
  'opinion',
  'feature_profile',
  'interview',
  'listicle_roundup',
  'how_to_explainer',
  'review',
  'press_release',
  'sponsored',
  'podcast_video',
  'event_promo',
  'other',
];
export const ADRISK_VALUES: AdRisk[] = ['low', 'medium', 'high'];

export function triageModel(): string {
  return process.env.SELECTION_TRIAGE_MODEL?.trim() || DEFAULT_TRIAGE_MODEL;
}

// ---------- Prompt ----------

export const TRIAGE_SYSTEM_PROMPT = `You are the first-pass editor of a weekly news digest. You read short article cards and label each one. Respond with valid JSON only, no markdown, no code fences.

${UNTRUSTED_NOTICE} The cards sit between ===BEGIN CARDS=== and ===END CARDS===.

THE READER
A professional working in fashion, luxury, jewellery or ecommerce (for example a Pandora colleague) who wants to follow the relevant news reliably each week. Judge every article for this person: would they want to know about it, and is it trustworthy independent journalism?

CATEGORIES (pick the single best fit, or null)
- AI_and_Strategy: AI first. AI is the PRIMARY subject: frontier labs and models (OpenAI, Anthropic, Google, Meta, xAI, Mistral, DeepSeek...), releases and capability leaps, benchmarks and evals, research and technical shifts, AI industry economics (funding, compute, pricing, partnerships, leadership), and regulation or policy that materially affects AI development. Also substantive applied AI in retail/commerce (agents at scale, real deployments with results). NOT this category: a commerce, retail or logistics story that only mentions "AI" in passing, generic "AI adoption" surveys, "AI will change jobs" commentary, vendor webinars.
- Ecommerce_Retail_Tech: digital commerce, platforms and marketplaces (Amazon, Shopify, Temu, Shein, Stripe...), payments, checkout, retail media and advertising measurement, logistics and fulfilment, fraud and identity, personalization, retail technology, AI in commerce, and ecommerce regulation (privacy, platform rules, marketplace and consumer-protection rules for online selling, customs duties on parcels). Grocery and delivery platforms count as ecommerce. Concrete developments by named companies or regulators beat commentary. NOT this category: travel retail, duty free and airport retail (those go to Luxury_and_Consumer), fashion sourcing, labour and supply-chain due diligence, sustainability and green-claims regulation, and brand or retailer financial results; those go to Luxury_and_Consumer (or Jewellery_Industry when about jewellery). Not jewellery or luxury-brand news unless the story is objectively top-tier for ecommerce.
- Luxury_and_Consumer: luxury, fashion and consumer brands. Deals (acquisitions, sales, stakes, bankruptcies), financial results and trading updates, leadership changes (CEO, creative director, board), strategy (restructurings, market entries and exits, flagship openings, pricing), major launches and collections from leading houses (LVMH, Kering, Hermes, Richemont, Prada, Chanel, Gucci, Burberry, Nike...), demand data and trade policy with direct retail impact. Watches belong here: watchmakers and watch groups (Rolex, Swatch Group, Patek Philippe, Audemars Piguet, Omega, TAG Heuer...), Swiss watch exports, the watch resale and pre-owned market, and watch launches.
- Jewellery_Industry: jewellery, diamonds, gemstones, gold and precious metals prices as they affect jewellery, lab-grown diamonds, major jewellers (Pandora, Signet, Tiffany, Cartier, Swarovski, Chow Tai Fook, Brilliant Earth...), mining and supply (De Beers, Alrosa), trade bodies and trade shows (WJA, JCK, CIBJO, Responsible Jewellery Council), industry deals, results and leadership. NOT watches: watch stories go to Luxury_and_Consumer, even from jewellery or watch trade titles. A story about a group's jewellery business (e.g. Cartier or Van Cleef & Arpels within Richemont) stays here.
- null: fits none of the four (general news, sport, entertainment, local news, politics, health, lifestyle, celebrity, anything with no clear tie to the categories above). Use null freely; do not force a category. A classifier hint is only a hint and is often wrong.

TYPE (what kind of piece it is)
- hard_news: reports something that happened this week (deal, result, launch, rollout, ruling, appointment).
- analysis: reporting with new data, numbers or sourcing that explains what a development means.
- opinion: a columnist's or contributor's view, editorial, advice or Q&A column.
- feature_profile: a longer feature or profile of a person, company or trend with reporting behind it.
- interview: a Q&A or interview-led piece.
- listicle_roundup: "X things", "brands to know", trend round-ups, gift guides, best-of lists, weekly news digests.
- how_to_explainer: a guide, tutorial or evergreen explainer that breaks no news.
- review: a product, collection, restaurant or hotel review.
- press_release: company announcement reproduced as an article, wire copy, "X announces" with no independent reporting.
- sponsored: advertorial, branded or partner content, paid placement, affiliate shopping content.
- podcast_video: a podcast episode, webinar, video or livestream page.
- event_promo: promotion of an event, conference, webinar, award entry or product drop.
- other: anything else.

SIGNIFICANCE 1-5 (one scale for every category, judged for the reader above)
- 5 landmark: a top-3 story of the week for this category (a major deal or result, a CEO change at a major group, a frontier model release, binding regulation, market-moving data).
- 4 important: someone following the category should know it this week.
- 3 notable: worthwhile, narrower impact.
- 2 minor: incremental, local, one small company.
- 1 noise: irrelevant, trivial, promotional.
GEOGRAPHY: the reader works for an international company (Europe, US, Asia). A single-country policy, a local retail-sales statistic or a local company story is significance 3 or lower unless it materially affects international brands or retailers, or is a major data point from a top-5 market (US, China, Japan, UK, Germany, France).
${PEER_RESULTS_RULE}
Be strict: most articles are 2 or 3. Reserve 5 for a handful of stories per week. Opinion, listicles, reviews and how-tos rarely exceed 3. Significance is about the story, not about how well it is written.

CONTROVERSY RULE: articles primarily about war or armed conflict, culture-war or polarising identity politics, or election horse-race politics get significance 2 or lower, unless there is a DIRECT retail, trade or AI-industry impact (tariffs and trade policy affecting retail pricing or supply chains, AI compliance laws such as the AI Act or GDPR, platform regulation with commerce impact, consumer protection law).

AD RISK (is this paid, PR or a hidden ad?)
- high: sponsored or advertorial content, branded or partner content, a press release or wire copy, affiliate shopping content ("best X to buy", deal roundups with buy links), a page that is plainly selling something.
- medium: a vendor-led piece quoting only the company with no independent voice or numbers, a product-launch puff piece, promotional adjectives, "in partnership with" or "presented by" framing.
- low: independent journalism or commentary.
Use the source, URL path and soft flags as evidence, but judge from the card as a whole.

OUTPUT
Return one JSON object: {"results":[{"i":<index>,"category":<category or null>,"type":<type>,"significance":<1-5 integer>,"adRisk":<"low"|"medium"|"high">,"reason":<at most 15 words>}]}
One row per article, using the index shown on its card. Output every index exactly once.`;

export interface TriageCardInput {
  article: Pick<Article, 'title' | 'source' | 'url' | 'snippet'>;
  hint: Topic | null;
  softFlags: string[];
}

function urlPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 120 ? u.pathname.slice(0, 120) : u.pathname;
  } catch {
    return url.slice(0, 120);
  }
}

/** Collapse whitespace/newlines and neutralise the card delimiters so card text cannot fake structure. */
export function cleanCardText(s: string): string {
  return (s || '').replace(/={3,}/g, '=').replace(/\s+/g, ' ').trim();
}

/** Pure prompt builder, exported for tests. Index = position in `cards`. */
export function buildTriagePrompt(cards: TriageCardInput[]): string {
  const body = cards
    .map((c, i) => {
      const snippet = cleanCardText(c.article.snippet || '').slice(0, 400);
      return [
        `[${i}] ${cleanCardText(c.article.title)}`,
        `Source: ${cleanCardText(c.article.source)}`,
        `Path: ${urlPath(c.article.url)}`,
        `Classifier hint: ${c.hint ?? 'none'}`,
        c.softFlags.length ? `Soft flags: ${c.softFlags.join(', ')}` : '',
        `Snippet: ${snippet || '(none)'}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
  return `Label these ${cards.length} articles (indices 0 to ${cards.length - 1}).\n\n===BEGIN CARDS===\n${body}\n===END CARDS===`;
}

// ---------- Response validation ----------

export type TriageFields = Pick<TriageResult, 'category' | 'type' | 'significance' | 'adRisk' | 'reason'>;

export interface TriageValidation {
  /** index -> validated fields */
  valid: Map<number, TriageFields>;
  /** indices (0..count-1) that are missing or failed validation */
  invalid: number[];
  /** human-readable problems, for logs */
  errors: string[];
}

function parseJsonLoose(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function validateRow(row: any): { ok: true; fields: TriageFields } | { ok: false; error: string } {
  if (!row || typeof row !== 'object') return { ok: false, error: 'row is not an object' };
  let category: Topic | null;
  if (row.category === null || row.category === undefined || row.category === 'null') category = null;
  else if (typeof row.category === 'string' && (TOPIC_VALUES as string[]).includes(row.category)) category = row.category as Topic;
  else return { ok: false, error: `bad category ${JSON.stringify(row.category)}` };

  if (typeof row.type !== 'string' || !(TYPE_VALUES as string[]).includes(row.type)) {
    return { ok: false, error: `bad type ${JSON.stringify(row.type)}` };
  }
  const sig = row.significance;
  if (typeof sig !== 'number' || !Number.isInteger(sig) || sig < 1 || sig > 5) {
    return { ok: false, error: `bad significance ${JSON.stringify(sig)}` };
  }
  if (typeof row.adRisk !== 'string' || !(ADRISK_VALUES as string[]).includes(row.adRisk)) {
    return { ok: false, error: `bad adRisk ${JSON.stringify(row.adRisk)}` };
  }
  const reason = typeof row.reason === 'string' ? row.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return {
    ok: true,
    fields: { category, type: row.type as ArticleType, significance: sig, adRisk: row.adRisk as AdRisk, reason },
  };
}

/**
 * Pure. `raw` = model output text (or already-parsed object). Rows are matched by
 * their `i` index, not by position. Bad rows, duplicates of a bad row, missing and
 * out-of-range indices all end up in `invalid` / `errors`; good rows are kept.
 */
export function validateTriageResponse(raw: unknown, count: number): TriageValidation {
  const valid = new Map<number, TriageFields>();
  const errors: string[] = [];
  const parsed = parseJsonLoose(raw) as any;
  const rows: unknown[] | null = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : null;
  if (!rows) {
    errors.push('response is not JSON with a "results" array');
    return { valid, invalid: Array.from({ length: count }, (_, i) => i), errors };
  }
  for (const row of rows as any[]) {
    const idx = row?.i;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= count) {
      errors.push(`bad index ${JSON.stringify(idx)}`);
      continue;
    }
    if (valid.has(idx)) {
      errors.push(`duplicate index ${idx}`);
      continue;
    }
    const r = validateRow(row);
    if (r.ok) valid.set(idx, r.fields);
    else errors.push(`[${idx}] ${r.error}`);
  }
  const invalid: number[] = [];
  for (let i = 0; i < count; i++) if (!valid.has(i)) invalid.push(i);
  return { valid, invalid, errors };
}

// ---------- Orchestration ----------

export type TriageUsage = TierUsage;

export interface TriageStats {
  total: number;
  cached: number;
  llm: number;
  retriedRows: number;
  fallbackRows: number;
  failedCalls: number;
}

export interface TriageOutput {
  results: Map<string, TriageResult>;
  usage: TriageUsage;
  stats: TriageStats;
  model: string;
}

export interface TriageOptions {
  week: string;
  hardFilterResults?: Map<string, HardFilterResult> | HardFilterResult[];
  classifierHints?: Map<string, Topic | null> | Record<string, Topic | null>;
  /** inject for tests */
  client?: OpenAI;
  /** disable cache read/write (tests, smoke) */
  noCache?: boolean;
}

type CacheEntry = TriageResult & { v: string; model: string };
type TriageCache = Record<string, Record<string, CacheEntry>>;

function toMap<V>(x: Map<string, V> | Record<string, V> | V[] | undefined, key?: (v: V) => string): Map<string, V> {
  if (!x) return new Map();
  if (x instanceof Map) return x;
  if (Array.isArray(x)) return new Map(x.map(v => [key!(v), v]));
  return new Map(Object.entries(x));
}

function fallbackResult(url: string, hint: Topic | null): TriageResult {
  return { url, category: hint, type: 'other', significance: 2, adRisk: 'low', reason: 'triage fallback', fallback: true };
}

async function callBatch(
  openai: OpenAI,
  model: string,
  cards: TriageCardInput[],
  usage: TriageUsage,
): Promise<TriageValidation> {
  const res = await createChatCompletion(openai, {
    model,
    ...temperatureParam(model, 0),
    ...reasoningParam(model, 'none'),
    ...maxTokensParam(model, 120 * cards.length + 200),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      { role: 'user', content: buildTriagePrompt(cards) },
    ],
  }, usage);
  return validateTriageResponse(res.choices?.[0]?.message?.content ?? '', cards.length);
}

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function triageArticles(articles: Article[], opts: TriageOptions): Promise<TriageOutput> {
  const model = triageModel();
  const hfr = Array.isArray(opts.hardFilterResults)
    ? new Map(opts.hardFilterResults.map(r => [r.url, r] as const))
    : toMap(opts.hardFilterResults);
  const hints = toMap(opts.classifierHints);
  const usage: TriageUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  const stats: TriageStats = { total: articles.length, cached: 0, llm: 0, retriedRows: 0, fallbackRows: 0, failedCalls: 0 };
  const results = new Map<string, TriageResult>();

  // cache
  let cache: TriageCache = {};
  if (!opts.noCache) {
    try {
      cache = (await readJsonCache<TriageCache>(TRIAGE_CACHE_KIND)) ?? {};
    } catch {
      cache = {};
    }
  }
  const weekCache = cache[opts.week] ?? {};

  const todo: Article[] = [];
  for (const a of articles) {
    const c = weekCache[a.url];
    if (c && c.v === TRIAGE_PROMPT_VERSION && c.model === model) {
      const { v: _v, model: _m, ...rest } = c;
      results.set(a.url, rest);
      stats.cached++;
    } else {
      todo.push(a);
    }
  }

  const cardOf = (a: Article): TriageCardInput => ({
    article: a,
    hint: hints.get(a.url) ?? null,
    softFlags: hfr.get(a.url)?.softFlags ?? [],
  });

  const openai = opts.client ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const newlyDone: TriageResult[] = [];

  const batches: Article[][] = [];
  for (let i = 0; i < todo.length; i += TRIAGE_BATCH_SIZE) batches.push(todo.slice(i, i + TRIAGE_BATCH_SIZE));

  await runPool(batches, TRIAGE_CONCURRENCY, async batch => {
    let pending = batch; // articles still without a valid result
    for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
      const cards = pending.map(cardOf);
      let v: TriageValidation | null = null;
      try {
        v = await callBatch(openai, model, cards, usage);
      } catch (err) {
        stats.failedCalls++;
        console.warn(`[triage] call failed (attempt ${attempt + 1}, ${pending.length} articles): ${(err as Error).message}`);
      }
      const still: Article[] = [];
      pending.forEach((a, i) => {
        const f = v?.valid.get(i);
        if (f) {
          const r: TriageResult = { url: a.url, ...f };
          results.set(a.url, r);
          newlyDone.push(r);
          stats.llm++;
          if (attempt > 0) stats.retriedRows++;
        } else {
          still.push(a);
        }
      });
      if (v && v.errors.length) console.warn(`[triage] ${v.errors.length} invalid row(s): ${v.errors.slice(0, 3).join('; ')}`);
      pending = still;
    }
    for (const a of pending) {
      results.set(a.url, fallbackResult(a.url, hints.get(a.url) ?? null));
      stats.fallbackRows++;
    }
  });

  // cache write: only real LLM results, keep last N weeks
  if (!opts.noCache && newlyDone.length > 0) {
    try {
      const fresh = (await readJsonCache<TriageCache>(TRIAGE_CACHE_KIND)) ?? cache;
      const wk = fresh[opts.week] ?? {};
      for (const r of newlyDone) wk[r.url] = { ...r, v: TRIAGE_PROMPT_VERSION, model };
      fresh[opts.week] = wk;
      const keep = Object.keys(fresh).sort().slice(-TRIAGE_CACHE_WEEKS);
      if (!keep.includes(opts.week)) keep.push(opts.week);
      const pruned: TriageCache = {};
      for (const k of keep) pruned[k] = fresh[k];
      await writeJsonCache(TRIAGE_CACHE_KIND, pruned);
    } catch (err) {
      console.warn(`[triage] cache write failed: ${(err as Error).message}`);
    }
  }

  return { results, usage, stats, model };
}
