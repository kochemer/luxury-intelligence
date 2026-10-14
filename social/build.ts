/**
 * Writes the week's social plan (data/weeks/{week}/social.json) from the
 * digest. Nothing is sent here; social/publish.ts sends each day's posts.
 *
 * The model writes only the sentences. Links, hashtags and fixed lines are
 * added in code, so a post can't carry a made-up URL. Each post is checked
 * (social/checks.ts); a failing post gets one retry with the problems listed,
 * then is marked dropped, which publish skips.
 */

import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { maxTokensParam, temperatureParam } from '../lib/llm/models';
import { HOUSE_STYLE_RULES, stripDashes } from '../lib/llm/houseStyle';
import type { Topic, WeeklyDigest } from '../lib/types/digest';
import { postProblems } from './checks';
import { absoluteUrl, issueUrl } from './links';
import { PHASE1_SLOTS, dueAtFor, postingMonday } from './schedule';
import { describeStory, leadStories, storyOfTheDay, type PickedStory } from './select';
import type { SocialPlan, SocialPost, Weekday } from './types';

/** Sends a prompt, returns the model's JSON text. Injectable for tests. */
export type Complete = (prompt: string) => Promise<string>;

const HASHTAG: Record<Topic, string> = {
  Luxury_and_Consumer: '#luxury',
  Ecommerce_Retail_Tech: '#ecommerce',
  Jewellery_Industry: '#jewelry',
  AI_and_Strategy: '#retailtech',
};

const VOICE = `VOICE: Luxury Intelligence, a weekly briefing on the business of luxury, ecommerce, jewellery and AI. Write like a sharp industry analyst talking to senior people in luxury and retail: plain English, concrete, one clear point. Third person or no person at all: never "I", never "we".

FACTS: use only facts, names and numbers that appear in the material below. Do not add context from your own knowledge. If a story has no number, don't invent one.

HONESTY: the stories are selected and summarised by AI. Never say or suggest that a person read, picked, curated or reviewed them.`;

function weekPoint(d: WeeklyDigest): string {
  return [
    d.oneSentenceSummary && `Headline of the week: ${d.oneSentenceSummary}`,
    d.editorialTake && `Editor's Spotlight (the week's argument):\n${d.editorialTake}`,
  ].filter(Boolean).join('\n\n');
}

/** Everything a post is allowed to state, for the fact check. */
export function sourceTextFor(d: WeeklyDigest, stories: PickedStory[]): string {
  return [
    d.oneSentenceSummary,
    d.editorialTake,
    d.weeklyInsight,
    ...(d.keyThemes || []),
    ...stories.flatMap((s) => [s.article.title, s.article.source, s.article.aiSummary, s.article.snippet]),
  ].filter(Boolean).join('\n');
}

function parseJson<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return JSON.parse(text.slice(start, end + 1)) as T;
}

const clean = (s: unknown) => stripDashes(String(s ?? '').trim());

// ── Formats ──────────────────────────────────────────────────────

interface Draft {
  parts: string[];
  modelText: string;
  storyIds: string[];
}

async function draftLinkedInIssue(d: WeeklyDigest, leads: PickedStory[], complete: Complete, feedback: string): Promise<Draft> {
  const prompt = `${VOICE}

${HOUSE_STYLE_RULES}

Write this week's LinkedIn post for the Luxury Intelligence company page.

${weekPoint(d)}

Lead stories (choose exactly 3 that best support the week's point):
${leads.map(describeStory).join('\n\n')}

Return JSON: {"opening": string, "signals": [{"id": string, "line": string}, ...3 items]}
- opening: 1 or 2 sentences, at most 230 characters. State the week's point plainly so someone scrolling stops. No question, no "this week".
- signals: exactly 3, using the ids above. Each line at most 200 characters: name the company or brand and the concrete fact, then in a short clause why it matters to luxury or retail leaders.
- No links, no hashtags, no emoji.${feedback}`;
  const out = parseJson<{ opening: string; signals: { id: string; line: string }[] }>(await complete(prompt));
  const signals = (out.signals || []).filter((s) => leads.some((l) => l.article.id === s.id)).slice(0, 3);
  if (signals.length !== 3) throw new Error(`expected 3 signals with known ids, got ${signals.length}`);
  const opening = clean(out.opening);
  const lines = signals.map((s) => `→ ${clean(s.line)}`);
  const tags = [...new Set(signals.map((s) => HASHTAG[leads.find((l) => l.article.id === s.id)!.topic]))];
  const text = [
    opening,
    lines.join('\n\n'),
    `The full issue, free every Monday: ${issueUrl(d.weekLabel, 'linkedin', 'issue-post')}`,
    tags.join(' '),
  ].join('\n\n');
  return { parts: [text], modelText: [opening, ...signals.map((s) => clean(s.line))].join('\n'), storyIds: signals.map((s) => s.id) };
}

async function draftXThread(d: WeeklyDigest, leads: PickedStory[], complete: Complete, feedback: string): Promise<Draft> {
  const prompt = `${VOICE}

${HOUSE_STYLE_RULES}

Write this week's X (Twitter) thread for @luxintel_hq.

${weekPoint(d)}

Lead stories (choose exactly 3):
${leads.map(describeStory).join('\n\n')}

Return JSON: {"hook": string, "posts": [{"id": string, "text": string}, ...3 items]}
- hook: the first post. The week's point in at most 220 characters. No link, no hashtag.
- posts: exactly 3, one story each, using the ids above. Each at most 240 characters: the company and the fact first, then why it matters. No links, no hashtags, no emoji, no numbering like "1/".${feedback}`;
  const out = parseJson<{ hook: string; posts: { id: string; text: string }[] }>(await complete(prompt));
  const posts = (out.posts || []).filter((p) => leads.some((l) => l.article.id === p.id)).slice(0, 3);
  if (posts.length !== 3) throw new Error(`expected 3 posts with known ids, got ${posts.length}`);
  const modelParts = [clean(out.hook), ...posts.map((p) => clean(p.text))];
  const parts = [...modelParts, `Full issue, free every Monday: ${issueUrl(d.weekLabel, 'x', 'thread')}`];
  return { parts, modelText: modelParts.join('\n'), storyIds: posts.map((p) => p.id) };
}

async function draftXStory(d: WeeklyDigest, story: PickedStory, day: Weekday, complete: Complete, feedback: string): Promise<Draft> {
  const prompt = `${VOICE}

${HOUSE_STYLE_RULES}

Write one X (Twitter) post about this story from this week's issue.

${describeStory(story)}

Return JSON: {"text": string}
- At most 240 characters. Lead with the company or brand and the concrete fact, then why it matters to luxury or retail. No link, no hashtag, no emoji.${feedback}`;
  const out = parseJson<{ text: string }>(await complete(prompt));
  const text = clean(out.text);
  return {
    parts: [text, `More in this week's issue: ${issueUrl(d.weekLabel, 'x', `story-${day}`)}`],
    modelText: text,
    storyIds: [story.article.id],
  };
}

// ── Plan ─────────────────────────────────────────────────────────

export async function buildSocialPlan(
  digest: WeeklyDigest,
  opts: { complete: Complete; earlierPosts: string[]; model: string; now?: Date; log?: (msg: string) => void }
): Promise<SocialPlan> {
  const { complete, earlierPosts, model } = opts;
  const log = opts.log ?? (() => {});
  const monday = postingMonday(digest.startISO);
  const leads = leadStories(digest);
  const image = digest.coverImageUrl
    ? { url: absoluteUrl(digest.coverImageUrl), alt: digest.coverImageAlt || `Luxury Intelligence cover for ${digest.weekLabel}` }
    : undefined;
  const posts: SocialPost[] = [];
  const written: string[] = [];

  for (const slot of PHASE1_SLOTS) {
    const base = {
      slot: slot.slot,
      channel: slot.channel,
      day: slot.day,
      localTime: slot.localTime,
      dueAtISO: dueAtFor(monday, slot.day, slot.localTime),
    };
    let stories: PickedStory[];
    let draft: (feedback: string) => Promise<Draft>;
    let withImage = false;
    if (slot.slot === 'linkedin-issue') {
      stories = leads;
      draft = (f) => draftLinkedInIssue(digest, leads, complete, f);
      withImage = true;
    } else if (slot.slot === 'x-thread') {
      stories = leads;
      draft = (f) => draftXThread(digest, leads, complete, f);
      withImage = true;
    } else {
      const story = storyOfTheDay(digest, slot.day as Exclude<Weekday, 'mon'>);
      if (!story) {
        posts.push({ ...base, parts: [], storyIds: [], status: 'dropped', problems: ['no story for this day'] });
        continue;
      }
      stories = [story];
      draft = (f) => draftXStory(digest, story, slot.day, complete, f);
    }

    const sourceText = sourceTextFor(digest, stories);
    let problems: string[] = [];
    let result: Draft | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const feedback = problems.length
        ? `\n\nYour previous attempt was rejected for: ${problems.join('; ')}. Fix every one of these.`
        : '';
      try {
        result = await draft(feedback);
        problems = postProblems({
          channel: slot.channel,
          parts: result.parts,
          modelText: result.modelText,
          sourceText,
          earlierPosts: [...earlierPosts, ...written],
        });
      } catch (err) {
        result = null;
        problems = [`could not write the post: ${(err as Error).message}`];
      }
      if (!problems.length) break;
      log(`  ${slot.slot}: attempt ${attempt} rejected: ${problems.join('; ')}`);
    }

    if (result && !problems.length) {
      written.push(result.parts.join('\n'));
      posts.push({ ...base, parts: result.parts, storyIds: result.storyIds, status: 'ready', ...(withImage && image ? { image } : {}) });
    } else {
      posts.push({ ...base, parts: result?.parts ?? [], storyIds: result?.storyIds ?? [], status: 'dropped', problems });
    }
  }

  return { week: digest.weekLabel, generatedAt: (opts.now ?? new Date()).toISOString(), model, posts };
}

// ── IO ───────────────────────────────────────────────────────────

export function openAiComplete(model: string): Complete {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return async (prompt) => {
    const res = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      ...maxTokensParam(model, 1200),
      ...temperatureParam(model, 0.7),
    });
    return res.choices[0]?.message?.content || '';
  };
}

/** All post texts from the 8 weeks before `week`, for the repeat check. */
export async function loadEarlierPosts(root: string, week: string): Promise<string[]> {
  const weeksDir = path.join(root, 'data', 'weeks');
  const weeks = (await fs.readdir(weeksDir).catch(() => [] as string[]))
    .filter((w) => /^\d{4}-W\d{2}$/.test(w) && w < week)
    .sort()
    .slice(-8);
  const texts: string[] = [];
  for (const w of weeks) {
    try {
      const plan = JSON.parse(await fs.readFile(path.join(weeksDir, w, 'social.json'), 'utf-8')) as SocialPlan;
      texts.push(...plan.posts.filter((p) => p.status === 'ready').map((p) => p.parts.join('\n')));
    } catch {
      // No plan that week.
    }
  }
  return texts;
}

export function socialPlanPath(root: string, week: string): string {
  return path.join(root, 'data', 'weeks', week, 'social.json');
}
