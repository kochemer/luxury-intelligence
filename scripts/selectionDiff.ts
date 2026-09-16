/**
 * Selection measurement harness — DIFF
 *
 * Compares two snapshots produced by scripts/selectionSnapshot.ts and reports,
 * per category: which stories were added, removed, reordered, or unchanged.
 * This is how every selection change is validated — no ranking change ships
 * without a before/after diff.
 *
 * Usage:
 *   npm run selection:diff -- data/harness/2026-W34__baseline.json data/harness/2026-W34__candidate.json
 */

import { promises as fs } from 'fs';

type SnapshotItem = { rank: number; title: string; source: string; url: string };
type Snapshot = { week: string; label: string; meta?: Record<string, unknown>; categories: Record<string, SnapshotItem[]> };

async function load(p: string): Promise<Snapshot> {
  return JSON.parse(await fs.readFile(p, 'utf-8')) as Snapshot;
}

function byUrl(items: SnapshotItem[]): Map<string, SnapshotItem> {
  return new Map(items.map(i => [i.url, i]));
}

function label(it: SnapshotItem): string {
  return `${it.title} — ${it.source}`;
}

function diffCategory(a: SnapshotItem[], b: SnapshotItem[]): {
  added: SnapshotItem[];
  removed: SnapshotItem[];
  moved: Array<{ item: SnapshotItem; from: number; to: number }>;
  stable: number;
} {
  const aMap = byUrl(a);
  const bMap = byUrl(b);
  const added = b.filter(i => !aMap.has(i.url));
  const removed = a.filter(i => !bMap.has(i.url));
  const moved: Array<{ item: SnapshotItem; from: number; to: number }> = [];
  let stable = 0;
  for (const bItem of b) {
    const aItem = aMap.get(bItem.url);
    if (!aItem) continue;
    if (aItem.rank !== bItem.rank) moved.push({ item: bItem, from: aItem.rank, to: bItem.rank });
    else stable++;
  }
  return { added, removed, moved, stable };
}

async function main() {
  const [pathA, pathB] = process.argv.slice(2);
  if (!pathA || !pathB) {
    console.error('Usage: npm run selection:diff -- <snapshotA.json> <snapshotB.json>');
    process.exit(1);
  }
  const [a, b] = await Promise.all([load(pathA), load(pathB)]);

  console.log(`\nSelection diff — ${a.week}`);
  console.log(`  A: ${a.label}  (${JSON.stringify(a.meta ?? {})})`);
  console.log(`  B: ${b.label}  (${JSON.stringify(b.meta ?? {})})`);

  const cats = Array.from(new Set([...Object.keys(a.categories), ...Object.keys(b.categories)]));
  let totalChanged = 0;

  for (const cat of cats) {
    const { added, removed, moved, stable } = diffCategory(a.categories[cat] ?? [], b.categories[cat] ?? []);
    const changed = added.length + removed.length + moved.length;
    totalChanged += added.length + removed.length;
    const flag = changed === 0 ? '· unchanged' : '';
    console.log(`\n${cat}  (stable ${stable}, +${added.length} / -${removed.length}, moved ${moved.length}) ${flag}`);
    removed.forEach(i => console.log(`  - REMOVED  ${label(i)}`));
    added.forEach(i => console.log(`  + ADDED    ${label(i)}`));
    moved.forEach(m => console.log(`  ~ MOVED    #${m.from}→#${m.to}  ${label(m.item)}`));
  }

  console.log(`\nTotal set changes across categories (added+removed): ${totalChanged}`);
}

main().catch(err => {
  console.error('[diff] Fatal:', err);
  process.exit(1);
});
