/**
 * Which candidate headlines are company moves, and what kind.
 *
 * Keyword matching alone filed podcasts, news roundups, watch reviews and
 * "Alexandre Arnault joins Nike's board" as brand moves. A model reads each
 * headline and answers two questions: is the brand the subject, and is this
 * something the company did? Everything it returns is checked before use.
 *
 * Results are cached per candidate in data/markets/classified.json, so each
 * headline is classified once, ever.
 */

import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { getModelFor, maxTokensParam, temperatureParam } from '@/lib/llm/models';
import { MOVE_TYPES, type MoveType } from '@/lib/markets/types';
import type { Candidate } from './candidates';

const CACHE_PATH = path.join(process.cwd(), 'data', 'markets', 'classified.json');
const BATCH = 20;
/** Bump to re-classify everything after a prompt change. */
const PROMPT_VERSION = 3;

export interface Classification {
  isMove: boolean;
  type: MoveType | null;
  importance: 'major' | 'minor';
  /** Checked restatement, or null to use the original headline. */
  headline: string | null;
}

type Cache = { version: number; items: Record<string, Classification> };

async function readCache(): Promise<Cache> {
  try {
    const c = JSON.parse(await fs.readFile(CACHE_PATH, 'utf-8')) as Cache;
    return c.version === PROMPT_VERSION ? c : { version: PROMPT_VERSION, items: {} };
  } catch {
    return { version: PROMPT_VERSION, items: {} };
  }
}

/**
 * A restatement is only used if it can't have added anything: it names the
 * brand, is short, and contains no number the original didn't.
 */
export function acceptHeadline(proposed: unknown, c: Pick<Candidate, 'brand' | 'title' | 'snippet'>): string | null {
  if (typeof proposed !== 'string') return null;
  const h = proposed.trim();
  if (h.length < 12 || h.length > 110) return null;
  const brandWord = c.brand.split(/\s|&/)[0]!.toLowerCase();
  if (!h.toLowerCase().includes(brandWord)) return null;
  const source = `${c.title} ${c.snippet}`;
  for (const n of h.match(/\d[\d.,]*/g) ?? []) if (!source.includes(n)) return null;
  return h;
}

export function parseClassification(raw: unknown, c: Candidate): Classification {
  const r = (raw ?? {}) as { isMove?: unknown; type?: unknown; headline?: unknown; importance?: unknown };
  const type = MOVE_TYPES.includes(r.type as MoveType) ? (r.type as MoveType) : null;
  const isMove = r.isMove === true && type !== null;
  // Anything not explicitly major is minor: an unclear answer should not
  // promote a headline to the top of a public page.
  const importance = isMove && r.importance === 'major' ? 'major' : 'minor';
  return { isMove, type: isMove ? type : null, importance, headline: isMove ? acceptHeadline(r.headline, c) : null };
}

function prompt(items: Candidate[]): string {
  return `You label news headlines for a luxury and jewellery industry briefing.

For each item, decide whether it reports a MOVE by the named brand: something the company itself did or announced. Moves include results and trading updates, leadership appointments or departures, new collections or products, store openings and retail changes, price changes, acquisitions, stakes, divestments, collaborations, fashion shows and events it staged, advertising campaigns or ambassadors, legal actions involving it, and corporate decisions.

NOT moves: reviews, opinion, guides, podcasts, round-ups where the brand is one of many, market commentary, and news about another company or person that only mentions the brand. Auction sales and resale of the brand's past pieces are NEVER moves: the auction house acted, not the brand.

Rate each move's "importance":
- "major": financial results or trading updates, CEO / creative director / board-level appointments and departures, acquisitions, stakes and divestments, price changes, flagship openings or market entries, new main-line collections and the brand's own main fashion show, legal actions, strategic decisions.
- "minor": product drops and limited editions, fragrance and beauty launches, licensed or merchandise lines, sales, discounts and promotions, other appointments, event appearances, ambassadors, exhibitions and pop-ups, charity and sponsorship.

Use only these types: ${MOVE_TYPES.join(', ')}.

Also write "headline": a short neutral restatement in British English, present or past tense, under 90 characters, that names the brand and adds nothing that isn't in the item. If you can't do that, return null.

Return JSON: {"results": [{"id": "<id>", "isMove": true|false, "type": "<type>"|null, "importance": "major"|"minor", "headline": "<text>"|null}]}

Items:
${items.map(c => JSON.stringify({ id: c.key, brand: c.brand, headline: c.title, snippet: c.snippet || undefined, source: c.source })).join('\n')}`;
}

export interface ClassifyStats { cached: number; classified: number; calls: number; failedBatches: number }

export async function classifyCandidates(candidates: Candidate[]): Promise<{ results: Map<string, Classification>; stats: ClassifyStats }> {
  const cache = await readCache();
  const results = new Map<string, Classification>();
  const todo: Candidate[] = [];
  for (const c of candidates) {
    const hit = cache.items[c.key];
    if (hit) results.set(c.key, hit); else todo.push(c);
  }
  const stats: ClassifyStats = { cached: results.size, classified: 0, calls: 0, failedBatches: 0 };
  if (todo.length === 0) return { results, stats };

  if (!process.env.OPENAI_API_KEY) {
    console.warn(`[Markets] ⚠ No OPENAI_API_KEY — ${todo.length} headline(s) left unclassified`);
    return { results, stats };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = getModelFor('markets');

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    stats.calls++;
    try {
      const resp = await openai.chat.completions.create({
        model,
        ...temperatureParam(model, 0),
        ...maxTokensParam(model, 2500),
        messages: [{ role: 'user', content: prompt(batch) }],
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as { results?: { id?: string }[] };
      const byId = new Map((parsed.results ?? []).map(r => [r.id, r]));
      for (const c of batch) {
        const r = byId.get(c.key);
        if (!r) continue; // left out: retried next run rather than cached as "not a move"
        const cls = parseClassification(r, c);
        results.set(c.key, cls);
        cache.items[c.key] = cls;
        stats.classified++;
      }
    } catch (err) {
      stats.failedBatches++;
      console.warn(`[Markets] ⚠ Classification batch failed: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
    }
  }

  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 1), 'utf-8');
  return { results, stats };
}
