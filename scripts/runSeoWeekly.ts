/**
 * The weekly SEO pass — everything too slow or too quota-bound to run daily.
 *
 * Three cadences, deliberately separate:
 *
 *   daily    seo:monitor   is anything broken right now?
 *   weekly   this          what does Google say, and what could be better?
 *   ad hoc   seo:audit     a quick check while working on something
 *
 * The daily monitor stays fast and narrow so its alerts stay trustworthy. This
 * job asks the slower questions: Google's per-page indexing verdict (52 URL
 * inspections), the internal link graph, and asset weight.
 *
 * It exists because nobody remembers to run things. The site's sitemap went
 * unread by Google for 214 days — 42 pages published and never announced —
 * and a reminder would have worked exactly as well as its absence did.
 *
 * Usage:
 *   npm run seo:weekly
 *   npm run seo:weekly -- --week=2026-W36
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runAudit } from '../seo/audit/runAudit';
import { runIndexingAudit } from '../seo/audit/indexingAudit';
import { analyseLinkGraph } from '../seo/optimize/linkGraph';
import { runAssetAudit } from '../seo/optimize/assetAudit';
import { buildReport } from '../seo/report/buildReport';
import { writeReport } from '../seo/report/writeReport';
import { getCurrentDigestWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import type { Finding, Category } from '../seo/types';

const CANONICAL_URL = 'https://luxury-intel.com';
const REPORT_PREFIX = 'weekly';

function parseArgs(): { week: string; baseUrl: string } {
  const args = process.argv.slice(2);
  const week = args.find(a => a.startsWith('--week='))?.split('=')[1] ?? getCurrentDigestWeek();
  validateWeekLabel(week);
  return {
    week,
    baseUrl: args.find(a => a.startsWith('--baseUrl='))?.split('=')[1]
      ?? process.env.SEO_BASE_URL
      ?? CANONICAL_URL,
  };
}

async function main() {
  const { week, baseUrl } = parseArgs();
  console.log(`[Weekly] Full SEO pass over ${baseUrl} for ${week}\n`);

  // Sequential, not parallel: each of these fetches all 52 pages or queries a
  // rate-limited API, and running them together would triple the concurrent
  // load on production for no wall-clock benefit worth having.
  console.log('[Weekly] 1/4 Static + live audit...');
  const audit = await runAudit({ baseUrl });

  console.log('[Weekly] 2/4 Asking Google about each page...');
  const indexing = await runIndexingAudit(baseUrl, (done, total) => {
    if (done % 20 === 0 || done === total) process.stdout.write(`\r         inspected ${done}/${total}`);
  });
  process.stdout.write('\n');

  console.log('[Weekly] 3/4 Internal link graph...');
  const links = await analyseLinkGraph(baseUrl);

  console.log('[Weekly] 4/4 Asset weight...');
  const assets = await runAssetAudit(baseUrl);

  const findings: Finding[] = [
    ...audit.findings,
    ...(indexing?.findings ?? []),
    ...links.findings,
    ...assets.findings,
  ];

  // Only claim coverage of what actually ran. When Search Console credentials
  // are absent, indexing is genuinely unchecked and must not read as clean.
  const coveredCategories = Array.from(new Set<Category>([
    ...audit.inputs.coveredCategories,
    ...(indexing?.coveredCategories ?? []),
    ...links.coveredCategories,
    ...assets.coveredCategories,
  ]));

  const report = await buildReport(week, baseUrl, findings, {
    ...audit.inputs,
    gscAvailable: indexing !== null,
    coveredCategories,
  }, REPORT_PREFIX);

  const { mdPath } = await writeReport(report, REPORT_PREFIX);

  // ── Summary ─────────────────────────────────────────────────────────────
  const bySeverity = new Map<string, number>();
  for (const f of report.findings) bySeverity.set(f.severity, (bySeverity.get(f.severity) ?? 0) + 1);

  console.log('');
  console.log(`[Weekly] Score ${report.score.overall}` +
    (report.delta.previousWeek
      ? ` (${report.delta.scoreChange >= 0 ? '+' : ''}${report.delta.scoreChange} vs ${report.delta.previousWeek})`
      : ' (no prior weekly report)'));
  console.log(`[Weekly] ${report.findings.length} finding(s): ` +
    (['critical', 'high', 'medium', 'low', 'info']
      .filter(s => bySeverity.has(s))
      .map(s => `${bySeverity.get(s)} ${s}`).join(', ') || 'none'));
  console.log(`[Weekly] ${report.delta.newFindings.length} new, ${report.delta.resolvedFindings.length} resolved`);

  if (indexing) {
    const indexed = indexing.inspections.filter(
      i => /submitted and indexed|indexed, not submitted/i.test(i.coverageState)
    ).length;
    console.log(`[Weekly] Google indexes ${indexed}/${indexing.inspected} pages`);
  } else {
    console.log('[Weekly] ⚠ No Search Console credentials — indexing was NOT checked this run.');
  }

  console.log(`[Weekly] Report: ${mdPath}`);

  // Surface the actionable ones inline; the report holds the rest.
  const actionable = report.findings.filter(f => f.severity === 'critical' || f.severity === 'high');
  if (actionable.length > 0) {
    console.log('\nNeeds attention:');
    const seen = new Set<string>();
    for (const f of actionable) {
      if (seen.has(f.code)) continue;
      seen.add(f.code);
      const count = actionable.filter(x => x.code === f.code).length;
      console.log(`  [${f.severity.toUpperCase()}] ${f.code}${count > 1 ? ` ×${count}` : ''} — ${f.title}`);
      console.log(`    → ${f.recommendation}`);
    }
  }

  // Non-zero only for critical/high, so a report full of opportunities does not
  // fail a scheduled job. The exit code means "a human should look", not
  // "something ran badly".
  process.exit(actionable.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[Weekly] ✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(2);
});
