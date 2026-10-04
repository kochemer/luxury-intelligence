/**
 * Pick the one story this week's short is about, and get its full text.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { enrichFullText } from '../../podcast/enrichFullText';
import { Budget } from './budget';
import { callJson } from './claude';
import { SELECT_SYSTEM } from './prompts';

export interface Candidate {
  id: string;
  title: string;
  url: string;
  source: string;
  topic: string;
  summary: string;
  snippet: string;
}

export interface Selection {
  chosenId: string;
  why: string;
  angle: string;
  runnersUp: string[];
}

export interface Story extends Candidate {
  text: string;
  selection: Selection;
}

const SELECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chosenId', 'why', 'angle', 'runnersUp'],
  properties: {
    chosenId: { type: 'string', description: 'id of the chosen story' },
    why: { type: 'string', description: 'One or two sentences: why this one makes the best 60-second video' },
    angle: { type: 'string', description: 'The joke or irony the video should build on, in one sentence' },
    runnersUp: { type: 'array', items: { type: 'string' }, description: 'ids of the next 2 best stories' },
  },
};

export async function loadCandidates(week: string): Promise<Candidate[]> {
  const digest = JSON.parse(await fs.readFile(path.join('data', 'digests', `${week}.json`), 'utf8'));
  const out: Candidate[] = [];
  for (const [topic, t] of Object.entries<any>(digest.topics)) {
    for (const a of t.top ?? []) {
      out.push({
        id: a.id, title: a.title, url: a.url, source: a.source, topic,
        summary: a.aiSummary ?? '', snippet: String(a.snippet ?? '').slice(0, 600),
      });
    }
  }
  return out;
}

/** Full text from the podcast step's cache, fetched if this article wasn't cached. */
async function fullTextFor(c: Candidate, week: string): Promise<string | null> {
  const map = await enrichFullText([{ url: c.url, title: c.title, source: c.source }], week);
  const e = map.get(c.url);
  return e && e.status === 'success' ? e.text : null;
}

export async function selectStory(week: string, budget: Budget, outDir: string): Promise<Story> {
  const cached = path.join(outDir, 'story.json');
  try {
    const s = JSON.parse(await fs.readFile(cached, 'utf8')) as Story;
    console.log(`[story] reusing ${cached}: ${s.title}`);
    return s;
  } catch { /* select fresh */ }

  const candidates = await loadCandidates(week);
  // The first ~250 words of each article let the editor see details a
  // one-line summary hides, without paying for 28 full articles.
  const previews = await Promise.all(candidates.map(async c => {
    const text = await fullTextFor(c, week);
    return { ...c, preview: text ? text.split(/\s+/).slice(0, 250).join(' ') : c.snippet };
  }));

  const user = `Week ${week}. Candidates:\n\n` + previews.map(c =>
    `### id=${c.id} [${c.topic}] ${c.title} (${c.source})\nSummary: ${c.summary}\nOpening: ${c.preview}\n`,
  ).join('\n') + `\nChoose the single best story for this week's 60-second video.`;

  const sel = await callJson<Selection>({
    budget, step: 'select-story', system: SELECT_SYSTEM, user,
    schema: SELECTION_SCHEMA, maxTokens: 6000, effort: 'medium',
  });

  const chosen = candidates.find(c => c.id === sel.chosenId);
  if (!chosen) throw new Error(`[story] model chose unknown id ${sel.chosenId}`);
  const text = await fullTextFor(chosen, week);
  if (!text) throw new Error(`[story] no full text for ${chosen.url}; can't ground a script on a snippet`);

  const story: Story = { ...chosen, text, selection: sel };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(cached, JSON.stringify(story, null, 2));
  console.log(`[story] chose: ${chosen.title}\n        why: ${sel.why}\n        angle: ${sel.angle}`);
  return story;
}
