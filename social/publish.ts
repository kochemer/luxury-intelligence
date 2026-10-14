/**
 * Sends today's posts from the week's social plan to the scheduler.
 *
 * Runs every weekday (social-publish.yml) and right after the Monday plan is
 * written (weekly-social.yml). Only today's posts are sent because Buffer's
 * free plan holds 1 scheduled X thread and 10 posts per channel at a time.
 *
 * Safe to run twice: before creating a post it asks the scheduler for the
 * day's posts on that channel and skips one whose text is already there.
 */

import { DateTime } from 'luxon';
import { BufferAuthError, type Scheduler } from './buffer';
import { SOCIAL_TZ, localDate } from './schedule';
import type { SocialPlan, SocialPost } from './types';

/** Fetches a URL; true when it answers 2xx. Injectable for tests. */
export type UrlCheck = (url: string) => Promise<boolean>;

export interface PublishOutcome {
  slot: string;
  result: 'sent' | 'draft' | 'already-scheduled' | 'would-send' | 'dropped' | 'failed';
  detail?: string;
  dueAtISO?: string;
}

/** A post scheduled for a time already past goes out this many minutes from now. */
const LATE_DELAY_MIN = 5;
/** After this local hour, a missed post is skipped rather than sent late. */
const LATEST_LOCAL_HOUR = 20;

const URL_RE = /https?:\/\/[^\s)]+/g;

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase();
}

export function postsDueOn(plan: SocialPlan, date: string): SocialPost[] {
  return plan.posts.filter((p) => localDate(p.dueAtISO) === date);
}

/** When to schedule: the planned time, or a few minutes from now if that has passed. */
export function sendTime(post: SocialPost, now: Date): string | null {
  const planned = DateTime.fromISO(post.dueAtISO, { zone: 'utc' });
  const soonest = DateTime.fromJSDate(now).toUTC().plus({ minutes: 2 });
  if (planned > soonest) return planned.toISO()!;
  if (DateTime.fromJSDate(now).setZone(SOCIAL_TZ).hour >= LATEST_LOCAL_HOUR) return null;
  return DateTime.fromJSDate(now).toUTC().plus({ minutes: LATE_DELAY_MIN }).startOf('minute').toISO()!;
}

export async function publishDay(args: {
  plan: SocialPlan;
  date: string; // Copenhagen "YYYY-MM-DD"
  now: Date;
  scheduler: Scheduler;
  checkUrl: UrlCheck;
  mode: 'live' | 'draft' | 'dry-run';
  log?: (msg: string) => void;
}): Promise<PublishOutcome[]> {
  const { plan, date, now, scheduler, checkUrl, mode } = args;
  const log = args.log ?? (() => {});
  const outcomes: PublishOutcome[] = [];

  for (const post of postsDueOn(plan, date)) {
    if (post.status !== 'ready') {
      outcomes.push({ slot: post.slot, result: 'dropped', detail: (post.problems || []).join('; ') });
      continue;
    }
    try {
      const when = sendTime(post, now);
      if (!when) {
        outcomes.push({ slot: post.slot, result: 'failed', detail: `missed its ${post.localTime} slot and it is too late in the day to send` });
        continue;
      }

      const urls = [...new Set([...post.parts.join('\n').matchAll(URL_RE)].map((m) => m[0]))];
      if (post.image) urls.push(post.image.url);
      const broken: string[] = [];
      for (const url of urls) if (!(await checkUrl(url))) broken.push(url);
      if (broken.length) {
        outcomes.push({ slot: post.slot, result: 'failed', detail: `link not reachable: ${broken.join(', ')}` });
        continue;
      }

      const dayStart = DateTime.fromISO(date, { zone: SOCIAL_TZ }).startOf('day').toUTC().toISO()!;
      const dayEnd = DateTime.fromISO(date, { zone: SOCIAL_TZ }).endOf('day').toUTC().toISO()!;
      const existing = await scheduler.findPosts(post.channel, dayStart, dayEnd);
      if (existing.some((e) => normalise(e.text) === normalise(post.parts[0]))) {
        outcomes.push({ slot: post.slot, result: 'already-scheduled' });
        continue;
      }

      if (mode === 'dry-run') {
        outcomes.push({ slot: post.slot, result: 'would-send', dueAtISO: when });
        continue;
      }
      const { id } = await scheduler.createPost({
        channel: post.channel,
        parts: post.parts,
        image: post.image,
        dueAtISO: when,
        asDraft: mode === 'draft',
      });
      log(`  ${post.slot}: ${mode === 'draft' ? 'saved as draft' : 'scheduled'} for ${when} (Buffer ${id})`);
      outcomes.push({ slot: post.slot, result: mode === 'draft' ? 'draft' : 'sent', dueAtISO: when, detail: id });
    } catch (err) {
      if (err instanceof BufferAuthError) throw err;
      outcomes.push({ slot: post.slot, result: 'failed', detail: (err as Error).message });
    }
  }
  return outcomes;
}

/** GET with redirects; our own pages get retries because Vercel may still be deploying. */
export function httpUrlCheck(fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): UrlCheck {
  return async (url) => {
    const ours = new URL(url).hostname === 'luxury-intel.com';
    const attempts = ours ? 10 : 2;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
        if (res.ok) return true;
      } catch {
        // retry
      }
      if (i < attempts - 1) await sleep(30000);
    }
    return false;
  };
}

/** Days until the Buffer key expires, from BUFFER_KEY_EXPIRES (YYYY-MM-DD). Null when unset. */
export function keyDaysLeft(expires: string | undefined, now: Date): number | null {
  if (!expires || !/^\d{4}-\d{2}-\d{2}$/.test(expires.trim())) return null;
  const end = DateTime.fromISO(expires.trim(), { zone: SOCIAL_TZ }).startOf('day');
  const today = DateTime.fromJSDate(now).setZone(SOCIAL_TZ).startOf('day');
  return Math.round(end.diff(today, 'days').days);
}

/** Warn 7, 3 and 1 days ahead, and every day once expired. */
export function shouldWarnAboutKey(daysLeft: number | null): boolean {
  return daysLeft !== null && (daysLeft <= 0 || daysLeft === 1 || daysLeft === 3 || daysLeft === 7);
}
