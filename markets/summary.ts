/**
 * "This week": two or three sentences on what the companies did.
 *
 * Generated only from the week's classified moves, and checked: every
 * sentence must name a brand from those moves, and contain no number that
 * isn't in them. If the model fails the checks twice, the section is left
 * out. A missing summary costs nothing; a confidently wrong one on a public
 * page costs credibility.
 */

import OpenAI from 'openai';
import { getModelFor, maxTokensParam, temperatureParam } from '@/lib/llm/models';
import type { MarketId, MarketMove } from '@/lib/markets/types';

export function validateSummary(sentences: unknown, moves: MarketMove[]): { ok: true; sentences: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(sentences) || sentences.length < 1 || sentences.length > 3) return { ok: false, reason: `need 1–3 sentences, got ${Array.isArray(sentences) ? sentences.length : 'none'}` };
  const brands = [...new Set(moves.map(m => m.brand))];
  const source = moves.map(m => `${m.originalTitle} ${m.headline}`).join(' ');
  const out: string[] = [];
  for (const s of sentences) {
    if (typeof s !== 'string') return { ok: false, reason: 'non-text sentence' };
    const t = s.trim();
    if (t.length < 20 || t.length > 240) return { ok: false, reason: `sentence length ${t.length}` };
    if (t.includes('!')) return { ok: false, reason: 'exclamation mark' };
    if (!brands.some(b => t.toLowerCase().includes(b.split(/\s|&/)[0]!.toLowerCase()))) return { ok: false, reason: `names no brand: "${t}"` };
    for (const n of t.match(/\d[\d.,]*/g) ?? []) if (!source.includes(n.replace(/[.,]$/, ''))) return { ok: false, reason: `number not in the moves: ${n}` };
    out.push(t);
  }
  return { ok: true, sentences: out };
}

export async function writeSummary(market: MarketId, moves: MarketMove[]): Promise<string[] | null> {
  if (moves.length < 1 || !process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = getModelFor('markets');
  let feedback = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = `Write at most 3 sentences (2 is ideal) summarising the most important things ${market === 'luxury' ? 'luxury houses' : 'jewellery brands'} did this week, for an industry briefing.

Rules: use only the facts below. Name the brand in every sentence. British English. Plain and factual: no hype, no exclamation marks, no speculation, no numbers that aren't below. Group related moves when it reads naturally. Each sentence under 200 characters.
${feedback}
Moves:
${moves.map(m => `- ${m.date} · ${m.brand} · ${m.type} · ${m.originalTitle}`).join('\n')}

Return JSON: {"sentences": ["...", "..."]}`;

    try {
      const resp = await openai.chat.completions.create({
        model,
        ...temperatureParam(model, 0.3),
        ...maxTokensParam(model, 500),
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as { sentences?: unknown };
      // More than three is a length problem, not a facts problem: keep the first three.
      const v = validateSummary(Array.isArray(parsed.sentences) ? parsed.sentences.slice(0, 3) : parsed.sentences, moves);
      if (v.ok) return v.sentences;
      feedback = `\nYour previous answer was rejected: ${v.reason}. Fix that.\n`;
      console.warn(`[Markets] ⚠ ${market} summary rejected: ${v.reason}`);
    } catch (err) {
      console.warn(`[Markets] ⚠ ${market} summary failed: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
    }
  }
  return null;
}
