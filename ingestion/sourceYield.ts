/**
 * Source yield tracking for RSS and Page sources.
 * Tracks incremental value (new articles vs duplicates) per source.
 *
 * Ingestion runs daily (RSS/pages only, `.github/workflows/daily-ingest.yml`)
 * plus once in the Sunday pipeline, so the report accumulates per ingestion
 * week: a save merges into an existing report for the same week, summing
 * counts per source. A new week starts a fresh report.
 *
 * Failed sources are recorded too (`failedRuns`, `lastError`) — previously a
 * feed that errored simply vanished from the report.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCurrentIngestionWeek } from '../lib/utils/getCurrentDigestWeek';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const YIELD_FILE = path.join(__dirname, '../data/source_yield.json');

export type SourceYield = {
  sourceName: string;
  type: 'rss' | 'page';
  itemsFetched: number;
  itemsParsed: number;
  newArticlesAdded: number;
  duplicates: number;
  yieldPct: number; // newArticlesAdded / itemsFetched * 100
  runs?: number; // ingestion runs this week that tried this source
  failedRuns?: number; // of those, how many errored
  lastError?: string; // most recent error message, if any run failed
  topDuplicateReasons?: string[]; // Optional: reasons for duplicates if available
};

export type SourceYieldReport = {
  timestamp: string;
  week?: string; // ingestion week the counts accumulate over
  runs?: number; // ingestion runs merged into this report
  sources: SourceYield[];
  summary: {
    totalSources: number;
    failedSources?: number; // sources that never succeeded this week
    totalItemsFetched: number;
    totalNewArticles: number;
    totalDuplicates: number;
    overallYieldPct: number;
  };
};

let yieldStats: SourceYield[] = [];

export function resetYieldStats(): void {
  yieldStats = [];
}

function pushYield(
  type: 'rss' | 'page',
  sourceName: string,
  itemsFetched: number,
  itemsParsed: number,
  newArticlesAdded: number,
  duplicates: number,
  error?: string
): void {
  const yieldPct = itemsFetched > 0 ? (newArticlesAdded / itemsFetched) * 100 : 0;
  yieldStats.push({
    sourceName,
    type,
    itemsFetched,
    itemsParsed,
    newArticlesAdded,
    duplicates,
    yieldPct,
    runs: 1,
    failedRuns: error ? 1 : 0,
    ...(error ? { lastError: error } : {}),
  });
}

export function addRssYield(
  sourceName: string,
  itemsFetched: number,
  itemsParsed: number,
  newArticlesAdded: number,
  duplicates: number,
  error?: string
): void {
  pushYield('rss', sourceName, itemsFetched, itemsParsed, newArticlesAdded, duplicates, error);
}

export function addPageYield(
  sourceName: string,
  itemsFetched: number,
  itemsParsed: number,
  newArticlesAdded: number,
  duplicates: number,
  error?: string
): void {
  pushYield('page', sourceName, itemsFetched, itemsParsed, newArticlesAdded, duplicates, error);
}

/**
 * Sums `current` into `previous` per source (keyed by type + name). Pure, so it
 * is unit-testable; `saveYieldReport` only adds the file I/O and week check.
 */
export function mergeYield(previous: SourceYield[], current: SourceYield[]): SourceYield[] {
  const byKey = new Map<string, SourceYield>();
  for (const s of previous) byKey.set(`${s.type}:${s.sourceName}`, { ...s });
  for (const s of current) {
    const key = `${s.type}:${s.sourceName}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...s });
      continue;
    }
    const itemsFetched = prev.itemsFetched + s.itemsFetched;
    const newArticlesAdded = prev.newArticlesAdded + s.newArticlesAdded;
    const lastError = s.lastError ?? prev.lastError;
    byKey.set(key, {
      ...prev,
      itemsFetched,
      itemsParsed: prev.itemsParsed + s.itemsParsed,
      newArticlesAdded,
      duplicates: prev.duplicates + s.duplicates,
      yieldPct: itemsFetched > 0 ? (newArticlesAdded / itemsFetched) * 100 : 0,
      runs: (prev.runs ?? 1) + (s.runs ?? 1),
      failedRuns: (prev.failedRuns ?? 0) + (s.failedRuns ?? 0),
      ...(lastError ? { lastError } : {}),
    });
  }
  return [...byKey.values()];
}

async function loadReportForWeek(week: string): Promise<SourceYieldReport | null> {
  try {
    const report = JSON.parse(await fs.readFile(YIELD_FILE, 'utf-8')) as SourceYieldReport;
    return report.week === week ? report : null;
  } catch {
    return null;
  }
}

export async function saveYieldReport(): Promise<void> {
  const week = getCurrentIngestionWeek();
  const previous = await loadReportForWeek(week);
  const sources = previous ? mergeYield(previous.sources, yieldStats) : yieldStats;

  const totalItemsFetched = sources.reduce((sum, s) => sum + s.itemsFetched, 0);
  const totalNewArticles = sources.reduce((sum, s) => sum + s.newArticlesAdded, 0);
  const totalDuplicates = sources.reduce((sum, s) => sum + s.duplicates, 0);
  const overallYieldPct = totalItemsFetched > 0 ? (totalNewArticles / totalItemsFetched) * 100 : 0;
  const failed = sources.filter(s => (s.failedRuns ?? 0) > 0 && (s.failedRuns ?? 0) >= (s.runs ?? 1));

  const report: SourceYieldReport = {
    timestamp: new Date().toISOString(),
    week,
    runs: (previous?.runs ?? 0) + 1,
    sources,
    summary: {
      totalSources: sources.length,
      failedSources: failed.length,
      totalItemsFetched,
      totalNewArticles,
      totalDuplicates,
      overallYieldPct,
    },
  };

  if (failed.length > 0) {
    console.warn(`[Source Yield] ${failed.length} source(s) failed every run this week: ${failed.map(s => s.sourceName).join(', ')}`);
  }

  try {
    await fs.mkdir(path.dirname(YIELD_FILE), { recursive: true });
    await fs.writeFile(YIELD_FILE, JSON.stringify(report, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`[Source Yield] Failed to save yield report: ${err.message}`);
  }
}

export function getYieldStats(): SourceYield[] {
  return [...yieldStats];
}
