/**
 * The weekly insights agent: one Claude Messages API call that reads the
 * active tiles, the removed ones and the data pack, and either proposes one new
 * tile or says "none". It has no tools and no memory; whatever it proposes is
 * only a proposal until checks.ts has passed it.
 *
 * The prompt carries no traffic numbers of its own (the repo is public): the
 * numbers reach the model at run time, inside the pack.
 */

import Anthropic from '@anthropic-ai/sdk';
import { LIMITS, MAX_ACTIVE, MAX_BARS, MAX_EVIDENCE } from './checks';
import type { AgentDecision, DataPack, InsightRecord, Proposal } from './types';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const insightsModel = () => process.env.INSIGHTS_MODEL?.trim() || DEFAULT_MODEL;

const log = (msg: string) => console.error(`[insights:agent] ${msg}`);

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM = `You maintain the "Historical insights" section of a private analytics page for the owner of a small news-digest website. The section shows at most ${MAX_ACTIVE} tiles. Each tile states one durable fact about the site's history that the owner would find useful or surprising. You are run once a week, with no human reviewing your output, so a program checks everything you write and rejects the whole proposal if any rule is broken.

What makes a good tile
- It is durable: still true and still interesting in a month. Not a weekly wobble.
- It is surprising or useful to the owner, who runs the site and wants to know who reads it, where they come from and what works.
- It is not already covered by an active tile, and not close to one the owner removed.
- Saying "none" is a good outcome. If nothing clearly beats the active tiles, answer "none". Prefer "none" to a weak tile.

How to read the data
- Facts come from four sources. "amp.*" is Amplitude. Until the cookie banner appeared it counted every visitor; since then it counts only visitors who accepted cookies, so those two periods must never be compared or added. "counter.*" is the cookieless visit counter: it counts a person once per day, so its weekly numbers are visitor-days, not people. "gsc.*" is Google Search Console. "subs.*" is the subscriber table.
- Every fact has an id, a label, a period and a value. Series are lists of values for a chart.
- Use only what the pack says. Do not use outside knowledge about the site or its numbers.

Rules the checks enforce (break one and the proposal is thrown away)
1. Cite the facts the tile rests on in "evidence" (at most ${MAX_EVIDENCE} ids, exact ids from the pack). Every cited id must be used: by a number in the text or by the chart.
2. Every number you write in eyebrow, hero, unit, summary, detail and chart labels must be the value of a cited fact, written at the precision you choose (4321 may be written 4,321 or 4.3k; 2.37 may be written 2.4 or 2). The only calculation allowed is a percentage of two cited facts: part divided by whole, times 100, written with a % sign and rounded (for example 78%). No sums, differences, growth rates, averages or ratios other than that. If the number you want is not a fact, you cannot use it; choose a different tile.
3. Write quantities as digits, never as words (write 3, not three; no "half", "twice", "double", "quarter"). Do not write version numbers or numbers that are not facts (no "top 5", no "7 days", no "in the last 3 weeks"). A period length that matches a cited fact's period is fine ("28 days" for a 28-day fact).
4. Every date you write must lie inside the periods of the cited facts: "18-24 May 2026", "13 Apr", "Jan-Mar", "May 2026", "2026", "2026-05-18", "W21". A month counts as covered only if a cited fact starts on or before its first day and reaches it. When in doubt, leave the date out.
5. No URLs, domain names or email addresses. Name groups the way the pack does (for example "LinkedIn", "Search", "AI assistants", "Edge"). No line breaks, markup, emoji or hashtags.
6. Length limits in characters: eyebrow ${LIMITS.eyebrow}, hero ${LIMITS.hero}, unit ${LIMITS.unit}, summary ${LIMITS.summary}, detail ${LIMITS.detail}, each chart label ${LIMITS.chartLabel}.
7. At most one new tile. If ${MAX_ACTIVE} tiles are active you must also name one active tile to retire in "retire" (choose the one that matters least or overlaps the new one most). With fewer than ${MAX_ACTIVE} active, do not set "retire".
8. At most half of your evidence ids may already be cited by any one active or retired tile.

How a tile is built
- eyebrow: a short label for the topic, like a section heading.
- hero: the one big figure or word, at most ${LIMITS.hero} characters, such as a count, a percentage or a short name.
- unit: what the hero measures, a few words.
- summary: one plain sentence. detail: one or two short sentences of context or caveat.
- Style: plain, short sentences. Say what happened. No hype, no marketing words, no "insights", no "journey", no exclamation marks, no em dashes. Do not claim a cause that the data does not show.
- chart (optional, at most one), built only from fact ids, never from numbers you type:
  - weekly: {"kind":"weekly","seriesId":<a series id>,"highlight":<one point key of that series>}. Cite the series id in evidence; the highlighted point's value is then a citable number. Other points are not.
  - share: {"kind":"share","partId":<fact id>,"wholeId":<fact id>,"partLabel":<short label>,"restLabel":<short label>}. Both facts cited. The part must not exceed the whole.
  - bars: {"kind":"bars","rows":[{"label":<short label>,"factId":<fact id>}, ...]} with 2 to ${MAX_BARS} rows. Each fact cited.

Answer with one JSON object and nothing else: {"decision":"add"|"none","reason":<one or two sentences, plain>,"insight":{...only when adding...},"retire":<active tile id, only when required>}. The "reason" is logged for the owner: say why this tile, or why none.`;

function renderTile(r: InsightRecord): string {
  const t = r.tile;
  return `#${r.id} (added ${r.addedOn} by ${r.addedBy}${r.retiredOn ? `, retired ${r.retiredOn} by ${r.retiredBy}` : ''})
  eyebrow: ${t.eyebrow} | hero: ${t.hero} ${t.unit}
  summary: ${t.summary}
  detail: ${t.detail}
  chart: ${t.chart ? t.chart.kind : 'none'}
  evidence ids: ${r.evidence.map(e => e.id).join(', ') || '(none)'}`;
}

export function renderPack(pack: DataPack): string {
  const facts = pack.facts.map(f => `${f.id} | ${f.label} | ${f.period.start}..${f.period.end} | ${f.value}`).join('\n');
  const series = pack.series.map(s =>
    `${s.id} | ${s.label} | ${s.period.start}..${s.period.end} | ${s.points.map(p => `${p.key}=${p.value}`).join(' ')}`).join('\n');
  return `FACTS (id | label | period | value)\n${facts}\n\nSERIES (id | label | period | key=value ...)\n${series}`;
}

export function buildUserPrompt(active: InsightRecord[], removed: InsightRecord[], pack: DataPack): string {
  return [
    `Today is ${pack.today}.`,
    `ACTIVE TILES (${active.length} of ${MAX_ACTIVE})\n${active.length ? active.map(renderTile).join('\n') : '(none yet)'}`,
    `RETIRED TILES (do not bring these back, in any wording)\n${removed.length ? removed.map(renderTile).join('\n') : '(none)'}`,
    pack.failedBlocks.length ? `DATA THAT COULD NOT BE LOADED THIS WEEK (do not guess at it)\n${pack.failedBlocks.join('\n')}` : '',
    `DATA PACK\n${renderPack(pack)}`,
    `Decide: add one new tile, or answer "none". ${active.length >= MAX_ACTIVE ? `${MAX_ACTIVE} tiles are active, so an added tile must name one to retire.` : 'Do not set "retire".'}`,
  ].filter(Boolean).join('\n\n');
}

// ── Output ───────────────────────────────────────────────────────────────────

const STR = { type: 'string' } as const;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'reason'],
  properties: {
    decision: { type: 'string', enum: ['add', 'none'] },
    reason: STR,
    retire: { type: 'integer' },
    insight: {
      type: 'object',
      additionalProperties: false,
      required: ['eyebrow', 'hero', 'unit', 'summary', 'detail', 'evidence'],
      properties: {
        eyebrow: STR, hero: STR, unit: STR, summary: STR, detail: STR,
        evidence: { type: 'array', items: STR },
        chart: {
          anyOf: [
            {
              type: 'object', additionalProperties: false, required: ['kind', 'seriesId', 'highlight'],
              properties: { kind: { type: 'string', enum: ['weekly'] }, seriesId: STR, highlight: STR },
            },
            {
              type: 'object', additionalProperties: false, required: ['kind', 'partId', 'wholeId', 'partLabel', 'restLabel'],
              properties: { kind: { type: 'string', enum: ['share'] }, partId: STR, wholeId: STR, partLabel: STR, restLabel: STR },
            },
            {
              type: 'object', additionalProperties: false, required: ['kind', 'rows'],
              properties: {
                kind: { type: 'string', enum: ['bars'] },
                rows: {
                  type: 'array',
                  items: { type: 'object', additionalProperties: false, required: ['label', 'factId'], properties: { label: STR, factId: STR } },
                },
              },
            },
          ],
        },
      },
    },
  },
} as const;

/** Parses the model's reply into a decision. Throws on anything that isn't one. */
export function parseDecision(text: string): AgentDecision {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(`the reply was not JSON: ${body.slice(0, 120)}`);
  }
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error('the reply was not a JSON object');
  if (o.decision !== 'add' && o.decision !== 'none') throw new Error(`decision must be "add" or "none", got ${JSON.stringify(o.decision)}`);
  if (typeof o.reason !== 'string') throw new Error('reason must be text');
  const out: AgentDecision = { decision: o.decision, reason: o.reason.trim() };
  if (o.decision === 'add') {
    if (!o.insight || typeof o.insight !== 'object') throw new Error('decision "add" has no insight');
    out.insight = o.insight as Proposal;
    if (o.retire !== undefined && o.retire !== null) {
      if (!Number.isInteger(o.retire)) throw new Error('retire must be an integer id');
      out.retire = o.retire as number;
    }
  }
  return out;
}

export interface AgentRun {
  decision: AgentDecision;
  model: string;
}

export async function runAgent(active: InsightRecord[], removed: InsightRecord[], pack: DataPack): Promise<AgentRun> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const model = insightsModel();
  const client = new Anthropic({ timeout: 10 * 60_000 });
  const prompt = buildUserPrompt(active, removed, pack);
  log(`asking ${model} (${Math.round(prompt.length / 4)} tokens of prompt, estimated)`);

  const res = await client.beta.messages.create({
    model,
    max_tokens: 16_000,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    // If a safety classifier declines the request, re-run it on a fallback model
    // instead of failing a weekly job (Claude API only).
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  log(`${res.model}: ${res.usage.input_tokens} in, ${res.usage.output_tokens} out, stop ${res.stop_reason}`);

  if (res.stop_reason === 'refusal') {
    return { model: res.model, decision: { decision: 'none', reason: 'The model declined the request; nothing was changed.' } };
  }
  if (res.stop_reason === 'max_tokens') throw new Error('the reply was cut off at max_tokens');
  const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  return { model: res.model, decision: parseDecision(text) };
}
