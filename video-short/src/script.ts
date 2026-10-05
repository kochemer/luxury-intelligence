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

export type VisualKind = 'title' | 'headline' | 'stat' | 'list' | 'versus' | 'meme' | 'code' | 'bars' | 'emoji' | 'intro' | 'outro';

export interface Visual {
  kind: VisualKind;
  big: string;
  small: string;
  items: string[];
  emoji: string;
  bars: { label: string; value: number; display: string }[];
  /** Companies/products to show as logo or wordmark (resolved in marks.ts). */
  entities?: string[];
  /** One generic icon name from marks.ICONS, or "". */
  icon?: string;
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
          vo: { type: 'string', description: 'Narration for this beat: two or three short sentences, about 10 seconds spoken' },
          visual: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'big', 'small', 'items', 'emoji', 'bars', 'entities', 'icon'],
            properties: {
              kind: { type: 'string', enum: ['title', 'headline', 'stat', 'list', 'versus', 'meme', 'code', 'bars', 'emoji'] },
              entities: { type: 'array', items: { type: 'string' }, description: 'Up to 2 company/product names from the source, shown as logo or wordmark' },
              icon: { type: 'string', description: 'One allowed generic icon name, or ""' },
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

// ── AI-isms ─────────────────────────────────────────────────────────

const STOCK_PHRASES = [
  "here's the thing", "here's the kicker", 'let that sink in', 'buckle up', 'game-changer', 'game changer',
  "in today's video", "let's dive in", 'the result?', 'spoiler alert', 'make no mistake',
  'at the end of the day', 'in a world where', 'the real question is', 'plot twist',
];

/** Text a viewer hears or reads (code lines excluded: semicolons are code there). */
function viewerText(sc: Scene): string[] {
  const v = sc.visual;
  return [sc.vo, v.big, v.small, ...(v.kind === 'code' ? [] : v.items), ...v.bars.map(b => b.label)];
}

/**
 * Deterministic check for patterns that make writing read as AI-generated.
 * Dashes are fixed automatically (fixDashes); everything else goes back for repair.
 */
export function checkAiIsms(script: Script): string[] {
  const p: string[] = [];
  script.scenes.forEach((sc, i) => {
    for (const t of viewerText(sc)) {
      const low = t.toLowerCase();
      if (t.includes(';')) p.push(`scene ${i + 1}: semicolon in "${t}"`);
      if (t.includes('!')) p.push(`scene ${i + 1}: exclamation mark in "${t}"`);
      if (t.includes('...') || t.includes('…')) p.push(`scene ${i + 1}: ellipsis in "${t}"`);
      for (const ph of STOCK_PHRASES) if (low.includes(ph)) p.push(`scene ${i + 1}: stock phrase "${ph}"`);
      if (/\b(it'?s|this is|that'?s)\s+not\b[^.]*,\s*(it'?s|this is|that'?s)\b/.test(low) ||
          /\bnot just\b[^.]*\bbut\b/.test(low) || /\bisn'?t about\b[^.]*,\s*it'?s about\b/.test(low)) {
        p.push(`scene ${i + 1}: "it's not X, it's Y" style contrast in "${t}"`);
      }
    }
  });
  const questions = script.scenes.filter(s => s.vo.includes('?')).length;
  if (questions > 1) p.push(`${questions} scenes ask rhetorical questions (max 1)`);
  return [...new Set(p)];
}

/** Dashes used as punctuation become commas (dropped at the end of a line). Code is left alone. */
export function fixDashes(script: Script): Script {
  const fix = (t: string) => t
    .replace(/\s*[—–]\s*$/, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*,/g, ',');
  return {
    ...script,
    scenes: script.scenes.map(sc => ({
      vo: fix(sc.vo),
      visual: {
        ...sc.visual, big: fix(sc.visual.big), small: fix(sc.visual.small),
        items: sc.visual.kind === 'code' ? sc.visual.items : sc.visual.items.map(fix),
      },
    })),
  };
}

export function checkShape(script: Script): string[] {
  const p: string[] = [];
  const n = script.scenes.length;
  if (n < 4 || n > 7) p.push(`scene count ${n} (want 5 to 6)`);
  const words = script.scenes.reduce((s, sc) => s + sc.vo.split(/\s+/).filter(Boolean).length, 0);
  if (words < 95 || words > 130) p.push(`narration is ${words} words (want 105 to 120)`);
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

  script = fixDashes(script);
  let problems = [...checkGrounding(script, story.text, [yearAllowed]), ...checkAiIsms(script), ...checkShape(script)];
  if (problems.length) {
    console.log(`[script] ${problems.length} problem(s), asking for one repair:\n  - ${problems.join('\n  - ')}`);
    script = await callJson<Script>({
      budget, step: 'repair-script', system, schema: SCRIPT_SCHEMA, maxTokens: 16000, effort: 'high',
      user: `${user}\n\nYour previous script:\n${JSON.stringify(script)}\n\nIt failed these automatic checks. ` +
        `Fix every one and keep everything else that worked. A number that is not in the source text must be ` +
        `removed or rewritten, not rephrased.\n- ${problems.join('\n- ')}`,
    });
    script = fixDashes(script);
    problems = [...checkGrounding(script, story.text, [yearAllowed]), ...checkAiIsms(script), ...checkShape(script)];
  }

  await fs.writeFile(path.join(outDir, 'script.draft.json'), JSON.stringify({ script, problems }, null, 2));
  const grounding = checkGrounding(script, story.text, [yearAllowed]);
  if (grounding.length) {
    // Shape problems are cosmetic; an unsupported fact is not shippable.
    throw new Error(`[script] still ungrounded after repair:\n  - ${grounding.join('\n  - ')}`);
  }
  const aiIsms = checkAiIsms(script);
  if (aiIsms.length) {
    // Owner rule: no AI-isms in anything we ship.
    throw new Error(`[script] still has AI-isms after repair:\n  - ${aiIsms.join('\n  - ')}`);
  }
  if (problems.length) console.log(`[script] shipping with cosmetic issues:\n  - ${problems.join('\n  - ')}`);
  await fs.writeFile(cached, JSON.stringify(script, null, 2));
  return script;
}
