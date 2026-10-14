/**
 * Send today's posts from the current social plan to Buffer.
 *
 * Usage:
 *   npm run social:publish                        # today (Copenhagen), live
 *   npm run social:publish -- --dry-run           # check links and Buffer, send nothing
 *   npm run social:publish -- --draft             # save as Buffer drafts (live test, nothing posts)
 *   npm run social:publish -- --date=2026-10-19   # a specific day
 *   npm run social:publish -- --week=2026-W41     # use that week's plan
 *
 * Needs BUFFER_API_KEY. BUFFER_KEY_EXPIRES (YYYY-MM-DD) turns on the expiry warning.
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { BufferAuthError, bufferScheduler } from '../social/buffer';
import { socialPlanPath } from '../social/build';
import { notifyOwner } from '../social/notify';
import { httpUrlCheck, keyDaysLeft, postsDueOn, publishDay, shouldWarnAboutKey } from '../social/publish';
import { SOCIAL_TZ } from '../social/schedule';
import type { SocialPlan } from '../social/types';

/** The newest plan with posts on `date` (this week's, or last week's on a late run). */
async function planFor(root: string, date: string, week?: string): Promise<SocialPlan | null> {
  const weeksDir = path.join(root, 'data', 'weeks');
  const weeks = week
    ? [week]
    : (await fs.readdir(weeksDir)).filter((w) => /^\d{4}-W\d{2}$/.test(w)).sort().reverse().slice(0, 3);
  for (const w of weeks) {
    try {
      const plan = JSON.parse(await fs.readFile(socialPlanPath(root, w), 'utf-8')) as SocialPlan;
      if (postsDueOn(plan, date).length) return plan;
    } catch {
      // no plan for that week
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const now = new Date();
  const date = args.find((a) => a.startsWith('--date='))?.split('=')[1] || DateTime.fromJSDate(now).setZone(SOCIAL_TZ).toISODate()!;
  const week = args.find((a) => a.startsWith('--week='))?.split('=')[1];
  const mode = args.includes('--dry-run') ? 'dry-run' : args.includes('--draft') ? 'draft' : 'live';
  const alerts: string[] = [];

  const daysLeft = keyDaysLeft(process.env.BUFFER_KEY_EXPIRES, now);
  if (daysLeft !== null) console.log(`[Social] Buffer key expires in ${daysLeft} day(s).`);
  if (shouldWarnAboutKey(daysLeft) && mode === 'live') {
    await notifyOwner(
      daysLeft! <= 0 ? 'Buffer API key has expired: posts will fail' : `Buffer API key expires in ${daysLeft} day(s)`,
      [
        'Create a new key at https://publish.buffer.com/settings/api',
        'Then run: gh secret set BUFFER_API_KEY  (and update .env.local)',
        'Then run: gh variable set BUFFER_KEY_EXPIRES --body YYYY-MM-DD  (the new expiry date)',
      ]
    );
  }

  const plan = await planFor(root, date, week);
  if (!plan) {
    console.log(`[Social] Nothing due on ${date}.`);
    return;
  }

  const apiKey = process.env.BUFFER_API_KEY?.trim();
  if (!apiKey) throw new Error('BUFFER_API_KEY is not set');

  console.log(`[Social] ${plan.week} plan, ${date}, mode ${mode}`);
  let outcomes;
  try {
    outcomes = await publishDay({
      plan,
      date,
      now,
      scheduler: bufferScheduler(apiKey),
      checkUrl: httpUrlCheck(),
      mode,
      log: console.log,
    });
  } catch (err) {
    if (err instanceof BufferAuthError && mode === 'live') {
      await notifyOwner('Buffer rejected the API key: no posts were sent today', [err.message, 'Create a new key at https://publish.buffer.com/settings/api, then gh secret set BUFFER_API_KEY']);
    }
    throw err;
  }

  for (const o of outcomes) {
    console.log(`  ${o.slot.padEnd(15)} ${o.result}${o.dueAtISO ? ` @ ${o.dueAtISO}` : ''}${o.detail && o.result !== 'sent' ? `: ${o.detail}` : ''}`);
    if (o.result === 'failed' || o.result === 'dropped') alerts.push(`${o.slot}: ${o.result}. ${o.detail ?? ''}`);
  }

  if (alerts.length && mode === 'live') {
    await notifyOwner(`Social posts: ${alerts.length} not sent on ${date}`, alerts);
  }
  if (outcomes.some((o) => o.result === 'failed')) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[Social] ✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
