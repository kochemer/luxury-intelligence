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
  /** 1-based position in its digest section (1 = the section's lead story). */
  rank: number;
  summary: string;
  snippet: string;
}

/** Only each section's lead stories are candidates: the video follows news value (owner, 2026-10-26). */
const PER_TOPIC = 3;

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
    why: { type: 'string', description: 'One or two sentences: why this is the week\'s most important story for the audience' },
    angle: { type: 'string', description: 'The joke or irony the video should build on, in one sentence' },
    runnersUp: { type: 'array', items: { type: 'string' }, description: 'ids of the next 2 best stories' },
  },
};

async function loadDigest(week: string): Promise<any> {
  return JSON.parse(await fs.readFile(path.join('data', 'digests', `${week}.json`), 'utf8'));
}

export async function loadCandidates(week: string): Promise<Candidate[]> {
  const digest = await loadDigest(week);
  const out: Candidate[] = [];
  for (const [topic, t] of Object.entries<any>(digest.topics)) {
    (t.top ?? []).slice(0, PER_TOPIC).forEach((a: any, i: number) => {
      out.push({
        id: a.id, title: a.title, url: a.url, source: a.source, topic, rank: i + 1,
        summary: a.aiSummary ?? '', snippet: String(a.snippet ?? '').slice(0, 600),
      });
    });
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

  const digest = await loadDigest(week);
  const candidates = await loadCandidates(week);
  // The first ~250 words of each article let the editor see details a
  // one-line summary hides, without paying for every full article.
  const previews = await Promise.all(candidates.map(async c => {
    const text = await fullTextFor(c, week);
    return { ...c, preview: text ? text.split(/\s+/).slice(0, 250).join(' ') : c.snippet };
  }));

  const themes: string[] = digest.keyThemes ?? [];
  const user = `Week ${week}.\nDigest headline: ${digest.oneSentenceSummary ?? '(none)'}\n` +
    `Key themes: ${themes.length ? themes.join('; ') : '(none)'}\n\nCandidates:\n\n` + previews.map(c =>
    `### id=${c.id} [${c.topic} #${c.rank}] ${c.title} (${c.source})\nSummary: ${c.summary}\nOpening: ${c.preview}\n`,
  ).join('\n') + `\nChoose this week's most newsworthy story for the 60-second video.`;

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
  const runnersUp = sel.runnersUp.map(id => candidates.find(c => c.id === id)?.title ?? id);
  console.log(`[story] chose: [${chosen.topic} #${chosen.rank}] ${chosen.title}\n        why: ${sel.why}\n` +
    `        angle: ${sel.angle}\n        runners-up: ${runnersUp.join(' | ')}`);
  return story;
}
