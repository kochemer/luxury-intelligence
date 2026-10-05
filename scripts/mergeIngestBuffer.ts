/**
 * Folds the daily-ingestion buffer back into the working tree.
 *
 * `.github/workflows/daily-ingest.yml` runs RSS + page ingestion Mon–Sat and
 * keeps the result in a GitHub Actions cache (`.ingest-buffer/`) instead of
 * committing it — a commit would trigger a Vercel deploy every day. Both the
 * daily job (before ingesting) and the Sunday digest build (before the
 * pipeline) restore that cache and run this script, so the week's articles
 * reach the Sunday digest even when a feed only lists its latest 10 items.
 *
 * - `data/articles.json`: adds buffered articles whose URL is not present yet,
 *   and fills a missing snippet. Never removes or overwrites anything.
 * - `data/source_yield.json`: takes the buffer's report when it covers the
 *   current ingestion week, so `saveYieldReport` keeps accumulating into it.
 *
 * No buffer (first run, cache evicted, local dev) is a no-op.
 *
 * Usage: npx tsx scripts/mergeIngestBuffer.ts [--from=.ingest-buffer]
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Article } from '../lib/types';
import type { SourceYieldReport } from '../ingestion/sourceYield';
import { getCurrentIngestionWeek } from '../lib/utils/getCurrentDigestWeek';

const ROOT = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, 'data/articles.json');
const YIELD = path.join(ROOT, 'data/source_yield.json');

export function mergeBufferedArticles(repo: Article[], buffer: Article[]): { merged: Article[]; added: number; snippetsFilled: number } {
  const byUrl = new Map(repo.map(a => [a.url, a]));
  const merged = [...repo];
  let added = 0;
  let snippetsFilled = 0;
  for (const a of buffer) {
    const existing = byUrl.get(a.url);
    if (!existing) {
      merged.push(a);
      byUrl.set(a.url, a);
      added++;
    } else if (!existing.snippet && a.snippet) {
      existing.snippet = a.snippet;
      snippetsFilled++;
    }
  }
  return { merged, added, snippetsFilled };
}

/** The buffer's yield report wins if it is for this week and has seen at least as many runs. */
export function pickYieldReport(
  repo: SourceYieldReport | null,
  buffer: SourceYieldReport | null,
  week: string
): SourceYieldReport | null {
  if (!buffer || buffer.week !== week) return null;
  if (repo?.week === week && (repo.runs ?? 1) > (buffer.runs ?? 1)) return null;
  return buffer;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function main() {
  const fromArg = process.argv.find(a => a.startsWith('--from='));
  const bufferDir = path.resolve(ROOT, fromArg ? fromArg.split('=')[1] : '.ingest-buffer');

  const bufferArticles = await readJson<Article[]>(path.join(bufferDir, 'articles.json'));
  if (!bufferArticles) {
    console.log(`[mergeIngestBuffer] No buffer at ${bufferDir}; nothing to merge.`);
    return;
  }

  const repoArticles = (await readJson<Article[]>(ARTICLES)) ?? [];
  const { merged, added, snippetsFilled } = mergeBufferedArticles(repoArticles, bufferArticles);
  if (added > 0 || snippetsFilled > 0) {
    await fs.writeFile(ARTICLES, JSON.stringify(merged, null, 2), 'utf-8');
  }
  console.log(`[mergeIngestBuffer] articles.json: +${added} from buffer, ${snippetsFilled} snippets filled (${merged.length} total).`);

  const week = getCurrentIngestionWeek();
  const report = pickYieldReport(
    await readJson<SourceYieldReport>(YIELD),
    await readJson<SourceYieldReport>(path.join(bufferDir, 'source_yield.json')),
    week
  );
  if (report) {
    await fs.writeFile(YIELD, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[mergeIngestBuffer] source_yield.json: using buffer report for ${week} (${report.runs ?? 1} runs so far).`);
  } else {
    console.log(`[mergeIngestBuffer] source_yield.json: buffer has no report for ${week}; left as is.`);
  }
}

if (process.argv[1]?.includes('mergeIngestBuffer')) {
  main().catch(err => {
    console.error('[mergeIngestBuffer] failed:', err);
    process.exit(1);
  });
}
