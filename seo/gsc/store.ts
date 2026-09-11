/**
 * Search Console snapshot storage.
 *
 * Google retains only ~16 months of Search Console history, and the agent's
 * future "did that change actually help?" evaluation needs a frozen before-state
 * to compare against. So snapshots are captured on every run and kept — they're
 * the only durable record once Google's window rolls past.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { GscRow, DateWindow } from './searchAnalytics';

const SNAPSHOT_DIR = path.join(process.cwd(), 'data', 'seo', 'gsc');

/** Keep roughly six months of weekly snapshots. */
const RETENTION = 26;

export interface GscTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  days: number;
}

export interface GscSnapshot {
  version: 1;
  pulledAtISO: string;
  siteUrl: string;
  windows: { current: DateWindow; previous: DateWindow };
  totals: { current: GscTotals; previous: GscTotals };
  pages: GscRow[];
  queries: GscRow[];
  queryPages: GscRow[];
}

export async function writeSnapshot(snapshot: GscSnapshot): Promise<string> {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const date = snapshot.pulledAtISO.slice(0, 10);
  const snapshotPath = path.join(SNAPSHOT_DIR, `${date}.json`);

  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  await fs.writeFile(path.join(SNAPSHOT_DIR, 'latest.json'), JSON.stringify(snapshot, null, 2), 'utf-8');

  await prune();
  return snapshotPath;
}

export async function readLatestSnapshot(): Promise<GscSnapshot | null> {
  try {
    const raw = await fs.readFile(path.join(SNAPSHOT_DIR, 'latest.json'), 'utf-8');
    return JSON.parse(raw) as GscSnapshot;
  } catch {
    return null;
  }
}

/** Drop the oldest dated snapshots beyond the retention window. */
async function prune(): Promise<void> {
  try {
    const files = (await fs.readdir(SNAPSHOT_DIR))
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();

    for (const stale of files.slice(0, Math.max(0, files.length - RETENTION))) {
      await fs.rm(path.join(SNAPSHOT_DIR, stale), { force: true });
    }
  } catch {
    // Pruning is best-effort; never fail a pull over it.
  }
}
