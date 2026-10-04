/**
 * Write the scene-by-scene script for the chosen story, then check every
 * fact and number in it against the source text. One repair pass is allowed.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { Budget } from './budget';
import { callJson } from './claude';
import { scriptSystem } from './prompts';
import type { Story } from './story';

export type VisualKind = 'title' | 'headline' | 'stat' | 'list' | 'versus' | 'meme' | 'code' | 'bars' | 'emoji' | 'outro';

export interface Visual {
  kind: VisualKind;
  big: string;
  small: string;
  items: string[];
  emoji: string;
  bars: { label: string; value: number; display: string }[];
}

export interface Scene { vo: string; visual: Visual }

export interface Script {
  title: string;
  scenes: Scene[];
  facts: { claim: string; sourceQuote: string }[];
}

const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'scenes', 'facts'],
  properties: {
    title: { type: 'string', description: 'Video title for YouTube/TikTok, max 70 chars, curiosity-driven, no clickbait lies' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['vo', 'visual'],
        properties: {
          vo: { type: 'string', description: 'Narration for this beat: one or two short sentences' },
          visual: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'big', 'small', 'items', 'emoji', 'bars'],
            properties: {
              kind: { type: 'string', enum: ['title', 'headline', 'stat', 'list', 'versus', 'meme', 'code', 'bars', 'emoji'] },
              big: { type: 'string', description: 'Main on-screen text ("" if unused)' },
              small: { type: 'string', description: 'Secondary on-screen text ("" if unused)' },
              items: { type: 'array', items: { type: 'string' }, description: 'For list/versus/meme/code; [] otherwise' },
              emoji: { type: 'string', description: 'One emoji for kind=emoji; "" otherwise' },
              bars: {
                type: 'array',
                description: 'For kind=bars; [] otherwise',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['label', 'value', 'display'],
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'number' },
                    display: { type: 'string', description: 'How the value is shown, e.g. "80%"' },
                  },
                },
              },
            },
          },
        },
      },
    },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'sourceQuote'],
        properties: {
          claim: { type: 'string' },
          sourceQuote: { type: 'string', description: 'Copied verbatim from the source text' },
        },
      },
    },
  },
};

// ── Grounding ───────────────────────────────────────────────────────

const norm = (s: string) => s
  .toLowerCase()
  .replace(/[‘’‛]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

/** Numbers as they'd appear in text: "11.6", "1,200" -> "1200", "80". */
const numbersIn = (s: string) =>
  (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(n => n.replace(/,/g, '').replace(/\.0+$/, ''));

/** Numbers we allow without a source: the format itself and trivial code literals. */
const ALLOWED = new Set(['0', '1', '2', '60']);

export function checkGrounding(script: Script, source: string, extraAllowed: string[] = []): string[] {
  const problems: string[] = [];
  const src = norm(source);
  const srcNumbers = new Set(numbersIn(source));
  const allowed = new Set([...ALLOWED, ...extraAllowed]);

  for (const f of script.facts) {
    if (!src.includes(norm(f.sourceQuote))) {
      problems.push(`facts: sourceQuote is not verbatim in the source: "${f.sourceQuote}"`);
    }
  }
  script.scenes.forEach((sc, i) => {
    const v = sc.visual;
    const texts = [sc.vo, v.big, v.small, ...v.items, ...v.bars.map(b => `${b.display} ${b.label}`)];
    for (const n of texts.flatMap(numbersIn)) {
      if (!srcNumbers.has(n) && !allowed.has(n)) {
        problems.push(`scene ${i + 1}: number "${n}" does not appear in the source`);
      }
    }
  });
  return [...new Set(problems)];
}

export function checkShape(script: Script): string[] {
  const p: string[] = [];
  const n = script.scenes.length;
  if (n < 12 || n > 22) p.push(`scene count ${n} (want 14 to 20)`);
  const words = script.scenes.reduce((s, sc) => s + sc.vo.split(/\s+/).filter(Boolean).length, 0);
  if (words < 100 || words > 150) p.push(`narration is ${words} words (want 115 to 130)`);
  for (let i = 2; i < n; i++) {
    const k = script.scenes[i].visual.kind;
    if (k === script.scenes[i - 1].visual.kind && k === script.scenes[i - 2].visual.kind) {
      p.push(`scenes ${i - 1} to ${i + 1} all use "${k}"`);
    }
  }
  return p;
}

// ── Generation ──────────────────────────────────────────────────────

function userPrompt(story: Story, dateLine: string) {
  return `This week's story (chosen by the editor):
Headline: ${story.title}
Outlet: ${story.source}
URL: ${story.url}
Editor's angle: ${story.selection.angle}
Air date context: ${dateLine}

SOURCE TEXT (the only allowed source of facts):
"""
${story.text}
"""

Write the script.`;
}

export async function writeScript(story: Story, budget: Budget, outDir: string, dateLine: string, yearAllowed: string): Promise<Script> {
  const cached = path.join(outDir, 'script.json');
  try {
    const s = JSON.parse(await fs.readFile(cached, 'utf8')) as Script;
    console.log(`[script] reusing ${cached}`);
    return s;
  } catch { /* write fresh */ }

  const system = scriptSystem();
  const user = userPrompt(story, dateLine);
  let script = await callJson<Script>({
    budget, step: 'write-script', system, user, schema: SCRIPT_SCHEMA, maxTokens: 16000, effort: 'high',
  });

  let problems = [...checkGrounding(script, story.text, [yearAllowed]), ...checkShape(script)];
  if (problems.length) {
    console.log(`[script] ${problems.length} problem(s), asking for one repair:\n  - ${problems.join('\n  - ')}`);
    script = await callJson<Script>({
      budget, step: 'repair-script', system, schema: SCRIPT_SCHEMA, maxTokens: 16000, effort: 'high',
      user: `${user}\n\nYour previous script:\n${JSON.stringify(script)}\n\nIt failed these automatic checks. ` +
        `Fix every one and keep everything else that worked. A number that is not in the source text must be ` +
        `removed or rewritten, not rephrased.\n- ${problems.join('\n- ')}`,
    });
    problems = [...checkGrounding(script, story.text, [yearAllowed]), ...checkShape(script)];
  }

  await fs.writeFile(path.join(outDir, 'script.draft.json'), JSON.stringify({ script, problems }, null, 2));
  const grounding = checkGrounding(script, story.text, [yearAllowed]);
  if (grounding.length) {
    // Shape problems are cosmetic; an unsupported fact is not shippable.
    throw new Error(`[script] still ungrounded after repair:\n  - ${grounding.join('\n  - ')}`);
  }
  if (problems.length) console.log(`[script] shipping with cosmetic issues:\n  - ${problems.join('\n  - ')}`);
  await fs.writeFile(cached, JSON.stringify(script, null, 2));
  return script;
}
