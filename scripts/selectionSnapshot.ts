/**
 * Selection measurement harness — SNAPSHOT
 *
 * Rebuilds the top-7 per category for one or more past weeks using the CURRENT
 * selection code + config, and writes a normalized, diffable snapshot. Pair with
 * scripts/selectionDiff.ts to compare two snapshots (e.g. baseline vs a proposed
 * change, or one rerank model vs another).
 *
 * Usage:
 *   npm run selection:snapshot -- --week=2026-W34 [--week=2026-W33] [--label=baseline]
 *   npm run selection:snapshot -- --weeks=2026-W30,2026-W31,2026-W32 --label=demote-keywords
 *
 * Notes:
 * - The candidate pool is reconstructed from the CURRENT data/articles.json
 *   filtered to each week, so both sides of an A/B use the same reconstructed
 *   pool — the diff isolates the selection *logic*, not pool drift.
 * - This makes real rerank LLM calls (cached in data/cache/rerank.json). To A/B
 *   a pure model swap you must currently clear that cache between runs, because
 *   its cache key does not yet include the model (tracked in the plan).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { loadEnv } from '../lib/env';
import { buildWeeklyDigest } from '../digest/buildWeeklyDigest';
import { getModelFor } from '../lib/llm/models';
import type { Topic } from '../lib/types';

loadEnv();

const TOPICS: Topic[] = [
  'AI_and_Strategy',
  'Ecommerce_Retail_Tech',
  'Luxury_and_Consumer',
  'Jewellery_Industry',
];

type SnapshotItem = { rank: number; title: string; source: string; url: string };
type Snapshot = {
  week: string;
  label: string;
  generatedAt: string;
  meta: {
    gitSha: string;
    rankModel: string;
    selectionModel: string;
    rerankMaxItems: number;
  };
  categories: Record<string, SnapshotItem[]>;
};

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseArgs(): { weeks: string[]; label: string } {
  const weeks: string[] = [];
  let label = 'baseline';
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--week=')) weeks.push(arg.slice('--week='.length));
    else if (arg.startsWith('--weeks=')) weeks.push(...arg.slice('--weeks='.length).split(',').map(s => s.trim()).filter(Boolean));
    else if (arg.startsWith('--label=')) label = arg.slice('--label='.length);
  }
  if (weeks.length === 0) {
    throw new Error('No weeks given. Use --week=YYYY-Www or --weeks=YYYY-Www,YYYY-Www');
  }
  return { weeks, label };
}

async function snapshotWeek(week: string, label: string): Promise<Snapshot> {
  const digest = await buildWeeklyDigest(week);
  const categories: Record<string, SnapshotItem[]> = {};
  for (const topic of TOPICS) {
    categories[topic] = (digest.topics[topic]?.top ?? []).map((a, i) => ({
      rank: i + 1,
      title: a.title,
      source: a.source,
      url: a.url,
    }));
  }
  return {
    week,
    label,
    generatedAt: new Date().toISOString(),
    meta: {
      gitSha: gitSha(),
      rankModel: getModelFor('rank'),
      selectionModel: process.env.SELECTION_MODEL || getModelFor('rank'),
      rerankMaxItems: parseInt(process.env.RERANK_MAX_ITEMS || '18', 10),
    },
    categories,
  };
}

async function main() {
  const { weeks, label } = parseArgs();
  const outDir = path.join(process.cwd(), 'data', 'harness');
  await fs.mkdir(outDir, { recursive: true });

  for (const week of weeks) {
    console.log(`\n[snapshot] Building ${week} (label: ${label})...`);
    const snap = await snapshotWeek(week, label);
    const outPath = path.join(outDir, `${week}__${label}.json`);
    await fs.writeFile(outPath, JSON.stringify(snap, null, 2), 'utf-8');
    console.log(`[snapshot] ✓ ${outPath}  (model=${snap.meta.rankModel}, maxItems=${snap.meta.rerankMaxItems}, sha=${snap.meta.gitSha})`);
    for (const topic of TOPICS) {
      const items = snap.categories[topic];
      console.log(`  ${topic} (${items.length}):`);
      items.forEach(it => console.log(`    ${it.rank}. ${it.title}  — ${it.source}`));
    }
  }
  console.log(`\n[snapshot] Done. Compare with: npm run selection:diff -- data/harness/<week>__A.json data/harness/<week>__B.json`);
}

main().catch(err => {
  console.error('[snapshot] Fatal:', err);
  process.exit(1);
});
