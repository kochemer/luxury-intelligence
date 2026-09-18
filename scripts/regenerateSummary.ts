/**
 * Regenerate oneSentenceSummary + keyThemes for one or more weeks using the
 * two-stage generator/judge pipeline. Everything else in the digest is preserved.
 *
 *   npx tsx scripts/regenerateSummary.ts --week=2026-W10
 *   npx tsx scripts/regenerateSummary.ts --weeks=2026-W30..2026-W37   # backfill a range
 */

import { promises as fs } from 'fs';
import path from 'path';
import { loadEnv } from '../lib/env';
import { getCurrentDigestWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { generateThemesForDigest } from '../digest/generateThemes';

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

async function main() {
  const args = process.argv.slice(2);
  let weeks: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--week=')) weeks = [arg.split('=')[1]];
    else if (arg === '--week') weeks = [args[++i]];
    else if (arg.startsWith('--weeks=')) weeks = expandWeekRange(arg.split('=')[1]);
  }
  if (weeks.length === 0) weeks = [getCurrentDigestWeek()];
  weeks.forEach(validateWeekLabel);

  const failed: string[] = [];
  for (const weekLabel of weeks) {
    try {
      await regenerateWeek(weekLabel);
    } catch (err) {
      console.error(`[Regenerate Summary] ✗ ${weekLabel}: ${err instanceof Error ? err.message : String(err)}`);
      failed.push(weekLabel);
    }
  }
  if (failed.length > 0) {
    console.error(`\n[Regenerate Summary] ✗ Failed weeks: ${failed.join(', ')}`);
    process.exit(1);
  }
}

async function regenerateWeek(weekLabel: string): Promise<void> {
  const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
  const raw = await fs.readFile(digestPath, 'utf-8');
  const digest = JSON.parse(raw);

  console.log(`\n[Regenerate Summary] Week: ${weekLabel}`);
  console.log(`[Regenerate Summary] Running two-stage generator → judge pipeline...\n`);

  // Force regeneration by passing regenThemes=true (bypasses cache)
  const result = await generateThemesForDigest(digest, true);

  if (!result?.oneSentenceSummary) {
    throw new Error('Failed to generate summary');
  }

  // Patch only the insight fields into the digest (preserve everything else)
  digest.oneSentenceSummary = result.oneSentenceSummary;
  digest.keyThemes = result.keyThemes;
  digest.contentUpdatedAtISO = new Date().toISOString(); // sitemap lastmod → re-crawl hint

  await fs.writeFile(digestPath, JSON.stringify(digest, null, 2), 'utf-8');

  console.log(`\n[Regenerate Summary] ✓ Saved to ${digestPath}`);
  console.log(`[Regenerate Summary] ✓ Final sentence: "${result.oneSentenceSummary}"`);
  console.log(`[Regenerate Summary] ✓ Key themes: ${result.keyThemes.join(' · ')}`);
  if (result.summaryCandidates?.length) {
    console.log(`\n[Regenerate Summary] All candidates considered:`);
    result.summaryCandidates.forEach((c, i) => console.log(`  [${i + 1}] ${c}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
