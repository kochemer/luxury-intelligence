/**
 * Source yield tracking for RSS and Page sources.
 * Tracks incremental value (new articles vs duplicates) per source.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  topDuplicateReasons?: string[]; // Optional: reasons for duplicates if available
};

export type SourceYieldReport = {
  timestamp: string;
  sources: SourceYield[];
  summary: {
    totalSources: number;
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

export function addRssYield(
  sourceName: string,
  itemsFetched: number,
  itemsParsed: number,
  newArticlesAdded: number,
  duplicates: number
): void {
  const yieldPct = itemsFetched > 0 ? (newArticlesAdded / itemsFetched) * 100 : 0;
  yieldStats.push({
    sourceName,
    type: 'rss',
    itemsFetched,
    itemsParsed,
    newArticlesAdded,
    duplicates,
    yieldPct,
  });
}

export function addPageYield(
  sourceName: string,
  itemsFetched: number,
  itemsParsed: number,
  newArticlesAdded: number,
  duplicates: number
): void {
  const yieldPct = itemsFetched > 0 ? (newArticlesAdded / itemsFetched) * 100 : 0;
  yieldStats.push({
    sourceName,
    type: 'page',
    itemsFetched,
    itemsParsed,
    newArticlesAdded,
    duplicates,
    yieldPct,
  });
}

export async function saveYieldReport(): Promise<void> {
  const totalItemsFetched = yieldStats.reduce((sum, s) => sum + s.itemsFetched, 0);
  const totalNewArticles = yieldStats.reduce((sum, s) => sum + s.newArticlesAdded, 0);
  const totalDuplicates = yieldStats.reduce((sum, s) => sum + s.duplicates, 0);
  const overallYieldPct = totalItemsFetched > 0 ? (totalNewArticles / totalItemsFetched) * 100 : 0;

  const report: SourceYieldReport = {
    timestamp: new Date().toISOString(),
    sources: yieldStats,
    summary: {
      totalSources: yieldStats.length,
      totalItemsFetched,
      totalNewArticles,
      totalDuplicates,
      overallYieldPct,
    },
  };

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


