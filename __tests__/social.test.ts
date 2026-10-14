/**
 * Social posting (social/). Posting is fully automatic with no human review
 * (owner, 2026-10-14), so the checks and the send logic are the review and are
 * pinned here. Uses a stub model and a fake scheduler: no network.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DateTime } from 'luxon';
import { factProblems, humanClaimProblems, lengthProblems, namesIn, numbersIn, repeatProblems, styleProblems, xLength, hashtagProblems } from '../social/checks';
import { dueAtFor, postingMonday } from '../social/schedule';
import { buildSocialPlan, type Complete } from '../social/build';
import { createPostInput, type Scheduler, type ScheduledPost, type NewPost } from '../social/buffer';
import { keyDaysLeft, publishDay, sendTime, shouldWarnAboutKey } from '../social/publish';
import type { WeeklyDigest } from '../lib/types/digest';
import type { Article } from '../lib/types/article';
import type { SocialPlan, SocialPost } from '../social/types';

// ── Fixtures ─────────────────────────────────────────────────────

const art = (id: string, title: string, aiSummary: string, source = 'WWD'): Article =>
  ({ id, title, url: `https://example.com/${id}`, source, published_at: '2026-10-08T00:00:00Z', ingested_at: '2026-10-08T00:00:00Z', aiSummary }) as Article;

const digest = {
  weekLabel: '2026-W41',
  tz: 'Europe/Copenhagen',
  startISO: '2026-10-04T22:00:00.000Z', // Mon 5 Oct 00:00 Copenhagen
  endISO: '2026-10-11T21:59:59.999Z',
  oneSentenceSummary: 'Americans abandon European fashion over taxes and returns.',
  editorialTake: 'Cheaper AI makes dependable ecommerce execution a stronger advantage for luxury brands.',
  coverImageUrl: '/weekly-images/2026-W41.png',
  coverImageAlt: 'Cover',
  totals: { total: 0, byTopic: { AIStrategy: 0, EcommerceRetail: 0, LuxuryConsumer: 0, Jewellery: 0 } },
  topics: {
    Luxury_and_Consumer: { total: 2, top: [art('l1', 'Americans abandon European fashion', 'WWD says taxes and returns stop US shoppers.'), art('l2', 'Gucci raises prices', 'Gucci raised prices by 5%.')] },
    Ecommerce_Retail_Tech: { total: 2, top: [art('e1', 'Ecommerce basics', 'BoF Insights says basic ecommerce failures block sales.', 'Business of Fashion (via Bing News)'), art('e2', 'IKEA resale', 'IKEA launched resale with prices 60% below new.')] },
    Jewellery_Industry: { total: 2, top: [art('j1', 'Blue Nile and Royal Asscher', 'Blue Nile is the exclusive retailer of Royal Asscher.'), art('j2', 'Titan sales', 'Titan diamond sales rose 30%.')] },
    AI_and_Strategy: { total: 2, top: [art('a1', 'Haiku 5.5 pricing', 'Anthropic priced Haiku 5.5 75% below Haiku 4.5.'), art('a2', 'Meta AI spend', 'Meta raised AI investment.')] },
  },
} as unknown as WeeklyDigest;

/** A stub model that answers each format from the prompt's own stories (titles, so every fact is in the digest). */
const stubModel: Complete = async (prompt) => {
  const ids = [...prompt.matchAll(/^id: (\S+)$/gm)].map((m) => m[1]);
  const titles = [...prompt.matchAll(/^title: (.+)$/gm)].map((m) => m[1]);
  if (prompt.includes('"signals"')) {
    return JSON.stringify({
      opening: 'Cheaper AI makes dependable ecommerce execution a stronger advantage for luxury brands.',
      signals: ids.slice(0, 3).map((id, i) => ({ id, line: `${titles[i]}: this shows where luxury brands win or lose online sales today, according to the report summarised in the issue.` })),
    });
  }
  if (prompt.includes('"hook"')) {
    return JSON.stringify({ hook: 'Americans abandon European fashion over taxes and returns.', posts: ids.slice(0, 3).map((id, i) => ({ id, text: `${titles[i]}, and what it means for checkout.` })) });
  }
  return JSON.stringify({ text: `${titles[0]}: why it matters for retail.` });
};

// ── Schedule ─────────────────────────────────────────────────────

test('posts go out the Monday after the digest week, at Copenhagen wall-clock time', () => {
  const monday = postingMonday(digest.startISO);
  assert.equal(monday.toISODate(), '2026-10-12');
  // Summer time (CEST, UTC+2): 10:00 local = 08:00 UTC.
  assert.equal(dueAtFor(monday, 'mon', '10:00'), '2026-10-12T08:00:00.000Z');
  // The clocks go back on 25 Oct; the next week's 10:00 is 09:00 UTC.
  const winterMonday = postingMonday('2026-10-18T22:00:00.000Z');
  assert.equal(winterMonday.toISODate(), '2026-10-26');
  assert.equal(dueAtFor(winterMonday, 'mon', '10:00'), '2026-10-26T09:00:00.000Z');
  assert.equal(dueAtFor(winterMonday, 'fri', '12:00'), '2026-10-30T11:00:00.000Z');
});

// ── Checks ───────────────────────────────────────────────────────

test('X counts any URL as 23 characters', () => {
  assert.equal(xLength(`Read: https://luxury-intel.com/digest/${'a'.repeat(200)}`), 6 + 23);
  assert.deepEqual(lengthProblems('x', ['a'.repeat(275)]), []);
  assert.equal(lengthProblems('x', ['a'.repeat(276)]).length, 1);
  assert.equal(lengthProblems('linkedin', ['too short']).length, 1);
});

test('no post may claim that a person picked or read the stories', () => {
  for (const bad of ['We read 2,000 articles so you don\'t have to.', 'Hand-picked by our editors.', 'Curated by the Luxury Intelligence team.', "I've picked three stories."]) {
    assert.equal(humanClaimProblems(bad).length, 1, bad);
  }
  assert.deepEqual(humanClaimProblems('Ranked from about 2,000 articles by AI.'), []);
});

test('numbers and names must come from the digest', () => {
  const source = 'Anthropic priced Haiku 5.5 75% below Haiku 4.5. Redseer reports Rs 24,000 crore in two days.';
  assert.deepEqual(numbersIn('Sales hit 24,000 crore, up 75%.'), ['24000', '75']);
  assert.deepEqual(factProblems('Anthropic cut Haiku 5.5 prices by 75%.', source), []);
  assert.deepEqual(factProblems('Anthropic cut prices by 80%.', source), ['number "80" is not in the digest']);
  assert.deepEqual(factProblems('Prices fell, says Gartner.', source), ['name "Gartner" is not in the digest']);
  // Sentence-initial capitals are ordinary words, not names.
  assert.deepEqual(namesIn('Luxury brands lose sales. Basic checkout matters.'), []);
});

test('house style and hashtag limits apply', () => {
  assert.ok(styleProblems("It's not about price, it's about trust.").length > 0);
  assert.deepEqual(styleProblems('Blue Nile now sells Royal Asscher.\n\n#luxury #jewelry'), []);
  assert.deepEqual(hashtagProblems('linkedin', ['a #luxury #jewelry #ecommerce']), []);
  assert.equal(hashtagProblems('linkedin', ['#a #b #c #d']).length, 1);
  assert.equal(hashtagProblems('x', ['#luxury']).length, 1);
});

test('a post that repeats an earlier one is caught', () => {
  const earlier = 'Blue Nile is now the exclusive North American retailer of Royal Asscher diamonds this autumn.';
  assert.equal(repeatProblems(earlier, [earlier]).length, 1);
  assert.deepEqual(repeatProblems('IKEA launched a resale marketplace in the UK.', [earlier]), []);
  // The link line every story post shares is not a repeat.
  const link = "More in this week's issue: https://luxury-intel.com/digest/october-2026-week-41";
  assert.deepEqual(repeatProblems(`IKEA launched resale.\n${link}`, [`Titan sales rose.\n${link}`]), []);
});

// ── Build ────────────────────────────────────────────────────────

test('the plan has the six Phase 1 posts, with links added in code', async () => {
  const plan = await buildSocialPlan(digest, { complete: stubModel, earlierPosts: [], model: 'stub' });
  assert.deepEqual(plan.posts.map((p) => p.slot), ['linkedin-issue', 'x-thread', 'x-story-tue', 'x-story-wed', 'x-story-thu', 'x-story-fri']);
  const byslot = Object.fromEntries(plan.posts.map((p) => [p.slot, p]));
  for (const p of plan.posts) assert.equal(p.status, 'ready', `${p.slot}: ${p.problems}`);

  const li = byslot['linkedin-issue'];
  assert.match(li.parts[0], /utm_source=linkedin&utm_medium=social&utm_campaign=2026-W41&utm_content=issue-post/);
  assert.equal(li.image?.url, 'https://luxury-intel.com/weekly-images/2026-W41.png');
  assert.equal(li.dueAtISO, '2026-10-12T08:00:00.000Z');

  const thread = byslot['x-thread'];
  assert.equal(thread.parts.length, 5);
  assert.match(thread.parts[4], /^Full issue, free every Monday: https:\/\/luxury-intel\.com\/digest\/october-2026-week-41\?utm_source=x/);
  // Story of the day uses each category's #2 story, never Monday's.
  assert.deepEqual(byslot['x-story-tue'].storyIds, ['l2']);
  assert.deepEqual(byslot['x-story-fri'].storyIds, ['a2']);
});

test('a post that keeps failing a check is dropped, not sent', async () => {
  const liar: Complete = async (prompt) => (prompt.includes('"text"') && !prompt.includes('"hook"') && !prompt.includes('"signals"')
    ? JSON.stringify({ text: 'Gartner says 99% of luxury shoppers quit.' })
    : stubModel(prompt));
  const plan = await buildSocialPlan(digest, { complete: liar, earlierPosts: [], model: 'stub' });
  const tue = plan.posts.find((p) => p.slot === 'x-story-tue')!;
  assert.equal(tue.status, 'dropped');
  assert.ok(tue.problems!.some((p) => p.includes('"99"')));
  assert.equal(plan.posts.find((p) => p.slot === 'linkedin-issue')!.status, 'ready');
});

// ── Buffer input ─────────────────────────────────────────────────

test('X posts go to Buffer as a thread, LinkedIn with the image as an asset', () => {
  const x = createPostInput({ channel: 'x', parts: ['one', 'two'], image: { url: 'https://i/x.png', alt: 'alt' }, dueAtISO: '2026-10-12T08:30:00.000Z' });
  assert.equal(x.text, 'one');
  assert.equal(x.mode, 'customScheduled');
  const thread = (x.metadata as { twitter: { thread: { text: string; assets: unknown[] }[] } }).twitter.thread;
  assert.deepEqual(thread.map((t) => t.text), ['one', 'two']);
  assert.equal(thread[0].assets.length, 1);
  assert.equal(thread[1].assets.length, 0);

  const li = createPostInput({ channel: 'linkedin', parts: ['post'], image: { url: 'https://i/x.png', alt: 'alt' }, dueAtISO: '2026-10-12T08:00:00.000Z' });
  assert.deepEqual(li.assets, [{ image: { url: 'https://i/x.png', metadata: { altText: 'alt' } } }]);
  assert.equal(li.aiAssisted, true);
  assert.equal(li.saveToDraft, undefined);
});

// ── Publish ──────────────────────────────────────────────────────

function fakeScheduler(existing: ScheduledPost[] = []) {
  const created: NewPost[] = [];
  const s: Scheduler = {
    async findPosts() { return existing; },
    async createPost(p) { created.push(p); return { id: `b${created.length}` }; },
    async deletePost() {},
  };
  return { s, created };
}

const post = (o: Partial<SocialPost>): SocialPost => ({
  slot: 'x-story-tue', channel: 'x', day: 'tue', localTime: '12:00', dueAtISO: '2026-10-13T10:00:00.000Z',
  parts: ['Story text', 'More: https://luxury-intel.com/digest/x'], storyIds: ['l2'], status: 'ready', ...o,
});
const planOf = (...posts: SocialPost[]): SocialPlan => ({ week: '2026-W41', generatedAt: '', model: 'stub', posts });
const ok = async () => true;

test('only today\'s ready posts are sent, at their planned time', async () => {
  const { s, created } = fakeScheduler();
  const plan = planOf(post({}), post({ slot: 'x-story-wed', day: 'wed', dueAtISO: '2026-10-14T10:00:00.000Z' }));
  const out = await publishDay({ plan, date: '2026-10-13', now: new Date('2026-10-13T04:30:00Z'), scheduler: s, checkUrl: ok, mode: 'live' });
  assert.deepEqual(out.map((o) => [o.slot, o.result]), [['x-story-tue', 'sent']]);
  assert.equal(created[0].dueAtISO, '2026-10-13T10:00:00.000Z');
});

test('a re-run does not post twice', async () => {
  const { s, created } = fakeScheduler([{ id: 'b1', text: 'Story text', dueAt: '2026-10-13T10:00:00Z', status: 'scheduled' }]);
  const out = await publishDay({ plan: planOf(post({})), date: '2026-10-13', now: new Date('2026-10-13T04:30:00Z'), scheduler: s, checkUrl: ok, mode: 'live' });
  assert.equal(out[0].result, 'already-scheduled');
  assert.equal(created.length, 0);
});

test('dropped posts and broken links are reported, never sent', async () => {
  const { s, created } = fakeScheduler();
  const plan = planOf(post({ status: 'dropped', problems: ['number "99" is not in the digest'] }), post({ slot: 'x-thread' }));
  const out = await publishDay({ plan, date: '2026-10-13', now: new Date('2026-10-13T04:30:00Z'), scheduler: s, checkUrl: async () => false, mode: 'live' });
  assert.deepEqual(out.map((o) => o.result), ['dropped', 'failed']);
  assert.match(out[1].detail!, /link not reachable/);
  assert.equal(created.length, 0);
});

test('a late run sends a few minutes from now, but not in the evening', () => {
  const p = post({});
  assert.equal(sendTime(p, new Date('2026-10-13T13:00:00Z')), '2026-10-13T13:05:00.000Z');
  assert.equal(sendTime(p, new Date('2026-10-13T19:00:00Z')), null); // 21:00 Copenhagen
  assert.equal(sendTime(p, new Date('2026-10-13T06:00:00Z')), '2026-10-13T10:00:00.000Z');
});

test('the key-expiry warning fires 7, 3 and 1 days ahead and after expiry', () => {
  const now = new Date('2026-11-06T06:30:00Z');
  assert.equal(keyDaysLeft('2026-11-13', now), 7);
  assert.equal(keyDaysLeft(undefined, now), null);
  assert.deepEqual([8, 7, 5, 3, 2, 1, 0, -2].map(shouldWarnAboutKey), [false, true, false, true, false, true, true, true]);
  assert.equal(DateTime.fromISO('2026-11-13').isValid, true);
});
