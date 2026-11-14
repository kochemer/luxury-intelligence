/**
 * What rose and what faded: themes in the luxury trade press, by month.
 *
 * The keyword themes on /markets catch 30–40 articles each over eight months
 * (China, tariffs, resale), too few to chart by month. So here a model labels
 * every headline against a fixed taxonomy (data/review/<year>/taxonomy.json,
 * proposed by a model from a sample on 2026-11-14 and then frozen). Labels are
 * cached by article id in data/review/<year>/labels.json; only new articles
 * cost anything on a re-run.
 *
 * Shares weight every outlet equally. Daily ingestion (2026-10-05) changed
 * which outlets dominate a month, and pooled shares read that as product
 * drops and travel "rising" in October.
 *
 * Jewellery has no themes chapter: five steady outlets, mostly Australian,
 * 20–90 articles per theme (checked 2026-11-14).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ThemeRow, ThemeSection } from '@/lib/review/types';
import { articleTime } from '../markets/coverage';
import { monthOf, type ReviewArticle } from './panel';

export interface Theme { name: string; definition: string; background: boolean }
/** Article id → theme numbers (1-based index into the taxonomy), at most two. */
export type Labels = Record<string, number[]>;

export const LABEL_MODEL = 'claude-opus-5-5';
const BATCH = 120;
const PARALLEL = 4;
/** An outlet's share for a month only counts with at least this many articles that month. */
export const MIN_OUTLET_MONTH = 8;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['labels'],
  properties: { labels: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['id', 't'],
    properties: { id: { type: 'string' }, t: { type: 'array', items: { type: 'integer' } } },
  } } },
} as const;

function systemPrompt(themes: Theme[]): string {
  return `You label luxury trade-press headlines with themes for a data review of the year.

Themes (number, name, definition):
${themes.map((t, i) => `${i + 1}. ${t.name}: ${t.definition}`).join('\n')}

For each headline return the numbers of the themes it is clearly about: usually one, at most two, and an empty list if none fits. Judge from the headline and snippet only. Do not stretch a theme to fit; an empty list is a correct answer. Return one entry per headline, using the id given.`;
}

/**
 * Label every article not yet in `labels`. Mutates and returns `labels`;
 * `onBatch` lets the caller save after each batch so a failed run resumes.
 */
export async function labelThemes(articles: ReviewArticle[], themes: Theme[], labels: Labels, onBatch?: () => Promise<void>): Promise<{ labelled: number; costUsd: number }> {
  const todo = articles.filter(a => !(a.id in labels));
  if (!todo.length) return { labelled: 0, costUsd: 0 };
  const client = new Anthropic({ timeout: 10 * 60_000 });
  const system = systemPrompt(themes);
  const batches: ReviewArticle[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

  let next = 0, costUsd = 0, labelled = 0;
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++]!;
      const user = batch.map(a => `${a.id} | ${a.title.trim()}${a.snippet ? ' — ' + a.snippet.replace(/\s+/g, ' ').slice(0, 160) : ''}`).join('\n');
      const res = await client.messages.stream({
        model: LABEL_MODEL, max_tokens: 16000,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: user }],
      }).finalMessage();
      if (res.stop_reason !== 'end_turn') throw new Error(`[Review] labelling stopped: ${res.stop_reason}`);
      const text = res.content.find(b => b.type === 'text');
      const parsed = JSON.parse(text && text.type === 'text' ? text.text : '{}') as { labels?: { id: string; t: number[] }[] };
      const ids = new Set(batch.map(a => a.id));
      for (const l of parsed.labels ?? []) {
        if (!ids.has(l.id)) continue;
        labels[l.id] = l.t.filter(n => Number.isInteger(n) && n >= 1 && n <= themes.length).slice(0, 2);
        labelled++;
      }
      const u = res.usage;
      // Opus 5.5: $4 in, $20 out per million tokens; cache writes 1.25×, reads $0.20.
      costUsd += ((u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25) * 4 + (u.cache_read_input_tokens ?? 0) * 0.2 + u.output_tokens * 20) / 1e6;
      await onBatch?.();
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return { labelled, costUsd };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Pure: labelled panel → the themes chapter. Unlabelled articles are left out of every count. */
export function themeSection(panel: ReviewArticle[], themes: Theme[], labels: Labels, months: string[]): ThemeSection {
  const done = panel.filter(a => a.id in labels);
  const outlets = [...new Set(done.map(a => a.source))].sort();

  // outlet → month → articles
  const cell = new Map<string, ReviewArticle[]>();
  for (const a of done) {
    const k = `${a.source}|${monthOf(a)}`;
    (cell.get(k) ?? cell.set(k, []).get(k)!).push(a);
  }
  const half = Math.ceil(months.length / 2);

  const rows = themes.map((t, i): ThemeRow => {
    const n = i + 1;
    const hits = done.filter(a => labels[a.id]!.includes(n));
    const monthlyShare = months.map(m => mean(outlets.flatMap(o => {
      const arts = cell.get(`${o}|${m}`) ?? [];
      return arts.length >= MIN_OUTLET_MONTH ? [arts.filter(a => labels[a.id]!.includes(n)).length / arts.length * 100] : [];
    })));
    const firstHalf = mean(monthlyShare.slice(0, half)), secondHalf = mean(monthlyShare.slice(half));
    const newest = [...hits].sort((a, b) => articleTime(b) - articleTime(a));
    return {
      name: t.name, definition: t.definition, background: t.background,
      articles: hits.length, outlets: new Set(hits.map(a => a.source)).size,
      monthlyShare: monthlyShare.map(round1),
      firstHalf: round1(firstHalf), secondHalf: round1(secondHalf),
      ratio: firstHalf ? Math.round((secondHalf / firstHalf) * 100) / 100 : null,
      examples: newest.slice(0, 3).map(a => ({ title: a.title.trim(), source: a.source, url: a.url, date: new Date(articleTime(a)).toISOString().slice(0, 10) })),
    };
  });

  return {
    market: 'luxury', outlets, articles: done.length,
    unlabelled: done.length ? round1(done.filter(a => !labels[a.id]!.length).length / done.length * 100) : 0,
    months, rows,
  };
}
