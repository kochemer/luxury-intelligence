/**
 * Regenerate the Editor's Take for one or more weeks without rebuilding the
 * full digest. Respects editorialTakeOverride (manually edited takes are kept).
 *
 *   npx tsx scripts/regenEditorialTake.ts --week=2026-W13
 *   npx tsx scripts/regenEditorialTake.ts --weeks=2026-W01..2026-W37
 */
import { promises as fs } from 'fs';
import path from 'path';
import { loadEnv } from '../lib/env';
import { validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { generateEditorialTakeForDigest } from '../digest/generateEditorialTake';

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

  if (digest.editorialTakeOverride) {
    console.log(`[EditorialTake] ${weekLabel}: override set, keeping the edited take`);
    return;
  }

  console.log(`[EditorialTake] ${weekLabel}: regenerating...`);
  const result = await generateEditorialTakeForDigest(digest, /* regenTake */ true);
  if (!result) throw new Error('generation failed (check OPENAI_API_KEY and the model response)');

  digest.editorialTake = result.editorialTake;
  digest.contentUpdatedAtISO = new Date().toISOString(); // sitemap lastmod → re-crawl hint
  await fs.writeFile(digestPath, JSON.stringify(digest, null, 2) + '\n', 'utf-8');

  const words = result.editorialTake.split(/\s+/).filter(Boolean).length;
  console.log(`[EditorialTake] ${weekLabel}: ✓ saved (${words} words)`);
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
  if (weeks.length === 0) {
    console.error('Usage: npx tsx scripts/regenEditorialTake.ts --week=YYYY-Wnn | --weeks=YYYY-Wnn..YYYY-Wnn');
    process.exit(1);
  }
  weeks.forEach(validateWeekLabel);

  const failed: string[] = [];
  for (const weekLabel of weeks) {
    try {
      await regenerateWeek(weekLabel);
    } catch (err) {
      console.error(`[EditorialTake] ✗ ${weekLabel}: ${err instanceof Error ? err.message : String(err)}`);
      failed.push(weekLabel);
    }
  }
  if (failed.length > 0) {
    console.error(`\n[EditorialTake] ✗ Failed weeks: ${failed.join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
