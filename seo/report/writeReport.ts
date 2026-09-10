import { promises as fs } from 'fs';
import path from 'path';
import { renderMarkdown } from './markdown';
import type { SeoReport } from '../types';

const REPORT_DIR = path.join(process.cwd(), 'data', 'seo');

// ⚠️ Stage 3 prerequisite: when the SEO agent is wired into the weekly
// pipeline, `data/seo/` MUST be added to ALLOWED_PATTERN and the `git add`
// line in .github/workflows/weekly-digest.yml. That workflow hard-fails on
// changed files outside its allowlist, so writing reports from CI without
// that change would break the weekly digest run. Stage 1 runs locally only,
// so it is not yet an issue.

/** Chronological comparison of "YYYY-Www" labels (week numbers aren't zero-padded consistently). */
function isAtLeastAsRecent(week: string, other: string): boolean {
  const [ya, wa] = week.split('-W').map(Number);
  const [yb, wb] = other.split('-W').map(Number);
  if (ya !== yb) return ya > yb;
  return wa >= wb;
}

export async function writeReport(report: SeoReport): Promise<{ jsonPath: string; mdPath: string }> {
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const jsonPath = path.join(REPORT_DIR, `report-${report.week}.json`);
  const mdPath = path.join(REPORT_DIR, `report-${report.week}.md`);
  const latestJsonPath = path.join(REPORT_DIR, 'latest.json');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  await fs.writeFile(mdPath, renderMarkdown(report), 'utf-8');

  // Only advance latest.json — auditing an older week on purpose (e.g. to
  // backfill) must not make the newest report disappear from `latest`.
  let shouldWriteLatest = true;
  try {
    const existing = JSON.parse(await fs.readFile(latestJsonPath, 'utf-8')) as SeoReport;
    shouldWriteLatest = isAtLeastAsRecent(report.week, existing.week);
  } catch {
    // No existing latest.json (or it's unreadable) — write it.
  }

  if (shouldWriteLatest) {
    await fs.writeFile(latestJsonPath, JSON.stringify(report, null, 2), 'utf-8');
  } else {
    console.log(`[SEO] ⓘ latest.json left untouched (holds a newer week than ${report.week})`);
  }

  console.log(`[SEO] ✓ Report saved to: ${jsonPath}`);
  console.log(`[SEO] ✓ Report saved to: ${mdPath}`);

  return { jsonPath, mdPath };
}
