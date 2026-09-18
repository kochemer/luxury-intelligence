/**
 * Regenerate the per-article AI summaries (`aiSummary`) for one or more weeks
 * with the current prompt + model. Only `aiSummary` is rewritten — selection,
 * insight, themes, translations, editorial take and cover are untouched.
 *
 *   npx tsx scripts/regenerateSummaries.ts --week=2026-W37
 *   npx tsx scripts/regenerateSummaries.ts --weeks=2026-W01..2026-W36
 *
 * Used for the 2026-09-18 archive backfill after the summary prompt rewrite
 * (roadmap F1.3): every week before W37 carried "The article from X dated Y…"
 * summaries, which is what Google saw on the "crawled – not indexed" pages.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { loadEnv } from '../lib/env';
import { validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { generateSummariesForDigest } from '../digest/generateSummaries';
import { checkDigestContentQuality } from '../pipeline/checks/digestContentQuality';

loadEnv();

/** Expand "2026-W30..2026-W37" into every ISO week label in the range (same year only). */
function expandWeekRange(range: string): string[] {
  const m = range.match(/^(\d{4})-W(\d{2})\.\.(\d{4})-W(\d{2})$/);
  if (!m || m[1] !== m[3]) throw new Error(`Bad --weeks range: ${range} (expected YYYY-Wnn..YYYY-Wnn, same year)`);
  const from = Number(m[2]);
  const to = Number(m[4]);
  if (from > to) throw new Error(`Bad --weeks range: ${range} (start after end)`);
  return Array.from({ length: to - from + 1 }, (_, i) => `${m[1]}-W${String(from + i).padStart(2, '0')}`);
}

async function regenerateWeek(weekLabel: string): Promise<void> {
  const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
  const digest = JSON.parse(await fs.readFile(digestPath, 'utf-8'));

  const before = Object.values<{ top: { aiSummary?: string }[] }>(digest.topics)
    .flatMap(t => t.top)
    .filter(a => a.aiSummary).length;

  console.log(`\n[Regenerate Summaries] ${weekLabel}: rewriting ${before} summaries...`);
  const stats = await generateSummariesForDigest(digest);
  console.log(`[Regenerate Summaries] ${weekLabel}: ok=${stats.succeeded} skipped=${stats.skipped} failed=${stats.failed}`);

  if (stats.failed > 0 && stats.succeeded === 0) {
    throw new Error('every summary failed — not writing');
  }

  const quality = checkDigestContentQuality(digest, { requireInsight: false, requireCover: false });
  if (!quality.ok) {
    throw new Error(`content-quality gate failed after regeneration: ${quality.errors.join('; ')}`);
  }

  await fs.writeFile(digestPath, JSON.stringify(digest, null, 2) + '\n', 'utf-8');
  console.log(`[Regenerate Summaries] ${weekLabel}: ✓ saved`);
}

async function main() {
  const args = process.argv.slice(2);
  let weeks: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--week=')) weeks = [arg.split('=')[1]];
    else if (arg === '--week') weeks = [args[++i]];
    else if (arg.startsWith('--weeks=')) weeks = expandWeekRange(arg.split('=')[1]);
  }
  if (weeks.length === 0) throw new Error('Pass --week=YYYY-Wnn or --weeks=YYYY-Wnn..YYYY-Wnn');
  weeks.forEach(validateWeekLabel);

  const failed: string[] = [];
  for (const weekLabel of weeks) {
    try {
      await regenerateWeek(weekLabel);
    } catch (err) {
      console.error(`[Regenerate Summaries] ✗ ${weekLabel}: ${err instanceof Error ? err.message : String(err)}`);
      failed.push(weekLabel);
    }
  }
  if (failed.length > 0) {
    console.error(`\n[Regenerate Summaries] ✗ Failed weeks: ${failed.join(', ')}`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
