/**
 * Write the week's social plan: data/weeks/{week}/social.json.
 * Nothing is posted; `npm run social:publish` sends each day's posts.
 *
 * Usage:
 *   npm run social:build                     # newest digest
 *   npm run social:build -- --week=2026-W41
 *   npm run social:build -- --force          # overwrite an existing plan
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { promises as fs } from 'fs';
import path from 'path';
import { getModelFor } from '../lib/llm/models';
import type { WeeklyDigest } from '../lib/types/digest';
import { buildSocialPlan, loadEarlierPosts, openAiComplete, socialPlanPath } from '../social/build';
import { notifyOwner } from '../social/notify';

async function newestWeek(root: string): Promise<string> {
  const files = (await fs.readdir(path.join(root, 'data', 'digests'))).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f)).sort();
  if (!files.length) throw new Error('no digests found');
  return files[files.length - 1].replace(/\.json$/, '');
}

async function main() {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const week = args.find((a) => a.startsWith('--week='))?.split('=')[1] || (await newestWeek(root));
  const outPath = socialPlanPath(root, week);

  if (!args.includes('--force')) {
    const exists = await fs.access(outPath).then(() => true, () => false);
    if (exists) {
      console.log(`[Social] ${week}: plan already exists, keeping it (use --force to rewrite).`);
      return;
    }
  }

  const digest = JSON.parse(await fs.readFile(path.join(root, 'data', 'digests', `${week}.json`), 'utf-8')) as WeeklyDigest;
  const model = getModelFor('polish');
  const plan = await buildSocialPlan(digest, {
    complete: openAiComplete(model),
    earlierPosts: await loadEarlierPosts(root, week),
    model,
    log: console.log,
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(plan, null, 2) + '\n', 'utf-8');

  const dropped = plan.posts.filter((p) => p.status === 'dropped');
  console.log(`[Social] ✓ ${week}: ${plan.posts.length - dropped.length} ready, ${dropped.length} dropped → ${path.relative(root, outPath)}`);
  for (const p of plan.posts) console.log(`  ${p.slot.padEnd(15)} ${p.status}${p.problems ? `: ${p.problems.join('; ')}` : ''}`);

  if (dropped.length && process.env.CI) {
    await notifyOwner(
      `Social posts: ${dropped.length} of ${plan.posts.length} dropped for ${week}`,
      dropped.map((p) => `${p.slot} (${p.day} ${p.localTime}): ${(p.problems || []).join('; ')}`)
    );
  }
}

main().catch((err) => {
  console.error('[Social] ✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
