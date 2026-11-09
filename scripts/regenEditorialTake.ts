/**
 * Regenerate The Week in Context (editorialTake) for one or more weeks without
 * rebuilding the full digest. Respects editorialTakeOverride (manually edited
 * takes are kept). This is the only way to rewrite a past week's take.
 *
 *   npx tsx scripts/regenEditorialTake.ts --week=2026-W13
 *   npx tsx scripts/regenEditorialTake.ts --weeks=2026-W01..2026-W37
 *
 * Dry run (writes nothing under data/, no take cache): generates the weeks in
 * sequence, each week's history being the new takes from the weeks before it,
 * and writes a markdown comparison to --out.
 *   npx tsx scripts/regenEditorialTake.ts --dry-run --from=2026-W38 --to=2026-W45 --out=<file.md>
 */
import { promises as fs } from 'fs';
import path from 'path';
import { loadEnv } from '../lib/env';
import { validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { generateEditorialTakeForDigest, generateTake, loadPreviousTakes, type PriorTake } from '../digest/generateEditorialTake';
import { readability, wordCount } from '../digest/takeChecks';

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
  if (result.format) digest.editorialTakeFormat = result.format;
  else delete digest.editorialTakeFormat;
  digest.contentUpdatedAtISO = new Date().toISOString(); // sitemap lastmod → re-crawl hint
  await fs.writeFile(digestPath, JSON.stringify(digest, null, 2) + '\n', 'utf-8');

  const words = result.editorialTake.split(/\s+/).filter(Boolean).length;
  console.log(`[EditorialTake] ${weekLabel}: ✓ saved (${words} words)`);
}

/** Dry run: new takes in sequence, history held in memory, nothing written under data/. */
async function dryRun(weeks: string[], outPath: string): Promise<void> {
  // History before the first week: the committed takes (old style, no format).
  const history: PriorTake[] = await loadPreviousTakes(weeks[0], 4);
  const quote = (text: string) => text.split('\n\n').map(p => `> ${p}`).join('\n>\n');
  const sections: string[] = [
    '# Take samples (dry run)\n',
    `Generated ${new Date().toISOString()}. Each week sees the previous weeks' NEW takes and formats. Nothing was written to data/.\n`,
  ];
  for (const weekLabel of weeks) {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    let digest;
    try {
      digest = JSON.parse(await fs.readFile(digestPath, 'utf-8'));
    } catch {
      console.warn(`[dry-run] ${weekLabel}: no digest file, skipped`);
      continue;
    }
    console.log(`[dry-run] ${weekLabel}...`);
    const result = await generateTake(digest, history);
    sections.push(`## ${weekLabel}\n\n**Old take:**\n\n${quote(String(digest.editorialTake ?? '(none)'))}\n`);
    if (!result) {
      sections.push('**New take:** generation failed\n');
      continue;
    }
    const r = readability(result.editorialTake);
    sections.push(
      `**New take** (format: \`${result.format ?? 'unknown'}\`, ${wordCount(result.editorialTake)} words, FK grade ${r.grade.toFixed(1)}, avg sentence ${r.avgSentenceWords.toFixed(1)} words):\n\n${quote(result.editorialTake)}\n`,
    );
    const j = result.judge;
    sections.push(`**Stated point:** ${j?.point ?? '(none)'}\n`);
    sections.push(`**Judge:** ${j ? JSON.stringify(j) : 'skipped'}\n`);
    sections.push(`**Remaining problems:** ${result.problems.length ? result.problems.join('; ') : 'none'}\n`);
    history.push({ weekLabel, text: result.editorialTake, format: result.format });
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, sections.join('\n'), 'utf-8');
  console.log(`[dry-run] wrote ${outPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    const from = args.find(a => a.startsWith('--from='))?.split('=')[1];
    const to = args.find(a => a.startsWith('--to='))?.split('=')[1];
    const out = args.find(a => a.startsWith('--out='))?.split('=')[1];
    if (!from || !to || !out) { console.error('Usage: --dry-run --from=YYYY-Wnn --to=YYYY-Wnn --out=<file.md>'); process.exit(1); }
    [from, to].forEach(validateWeekLabel);
    await dryRun(expandWeekRange(`${from}..${to}`), out);
    return;
  }
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
