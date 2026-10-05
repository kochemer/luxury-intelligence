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
 * Emails a summary every run — see seo/report/weeklyEmail.ts.
 *
 * Usage:
 *   npm run seo:weekly
 *   npm run seo:weekly -- --week=2026-W36
 *   npm run seo:weekly -- --no-email      # local runs while working on it
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runAudit } from '../seo/audit/runAudit';
import { runIndexingAudit } from '../seo/audit/indexingAudit';
import { analyseLinkGraph } from '../seo/optimize/linkGraph';
import { runAssetAudit } from '../seo/optimize/assetAudit';
import { buildReport } from '../seo/report/buildReport';
import { writeReport } from '../seo/report/writeReport';
import { sendWeeklyEmail } from '../seo/report/weeklyEmail';
import { getCurrentDigestWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { getGscClient } from '../seo/gsc/client';
import { pullSnapshot, summariseTraffic } from '../seo/gsc/snapshot';
import { writeSnapshot } from '../seo/gsc/store';
import { getVisitorSummary } from '../seo/analytics/visitors';
import { getCounterVisitorSummary } from '../lib/analytics/visits';
import type { Finding, Category, TrafficSummary, VisitorSummary } from '../seo/types';

const CANONICAL_URL = 'https://luxury-intel.com';
const REPORT_PREFIX = 'weekly';

function parseArgs(): { week: string; baseUrl: string; noEmail: boolean } {
  const args = process.argv.slice(2);
  const week = args.find(a => a.startsWith('--week='))?.split('=')[1] ?? getCurrentDigestWeek();
  validateWeekLabel(week);
  return {
    week,
    // For local runs while working on the job, so testing it does not email.
    noEmail: args.includes('--no-email'),
    baseUrl: args.find(a => a.startsWith('--baseUrl='))?.split('=')[1]
      ?? process.env.SEO_BASE_URL
      ?? CANONICAL_URL,
  };
}

async function main() {
  const { week, baseUrl, noEmail } = parseArgs();
  console.log(`[Weekly] Full SEO pass over ${baseUrl} for ${week}\n`);

  // Sequential, not parallel: each of these fetches all 52 pages or queries a
  // rate-limited API, and running them together would triple the concurrent
  // load on production for no wall-clock benefit worth having.
  console.log('[Weekly] 1/6 Static + live audit...');
  const audit = await runAudit({ baseUrl });

  console.log('[Weekly] 2/6 Asking Google about each page...');
  const indexing = await runIndexingAudit(baseUrl, (done, total) => {
    if (done % 20 === 0 || done === total) process.stdout.write(`\r         inspected ${done}/${total}`);
  });
  process.stdout.write('\n');

  console.log('[Weekly] 3/6 Internal link graph...');
  const links = await analyseLinkGraph(baseUrl);

  console.log('[Weekly] 4/6 Asset weight...');
  const assets = await runAssetAudit(baseUrl);

  // Traffic is the outcome everything else here serves, so it belongs in the
  // weekly record. A Search Console hiccup must not cost you the rest of the
  // report, though: on failure the email says traffic wasn't available.
  console.log('[Weekly] 5/6 Search traffic...');
  let traffic: TrafficSummary | null = null;
  const gsc = getGscClient();
  if (gsc) {
    try {
      const snapshot = await pullSnapshot(gsc);
      await writeSnapshot(snapshot);
      traffic = summariseTraffic(snapshot);
    } catch (err) {
      console.warn(`[Weekly] ⚠ Could not pull search traffic: ${err instanceof Error ? err.message : err}`);
    }
  }

  // The other half of the loop: who actually arrived, bots filtered out.
  // The site's cookieless counter first (it sees everyone); Amplitude, which
  // since the consent fix only sees visitors who accept cookies, as fallback.
  // Same rule as search traffic: a visitors problem never costs the report.
  console.log('[Weekly] 6/6 Visitors...');
  let visitors: VisitorSummary | null = null;
  try {
    visitors = await getCounterVisitorSummary();
    if (!visitors) console.log('         (counter has no data for the week — trying Amplitude)');
  } catch (err) {
    console.warn(`[Weekly] ⚠ Could not read the visit counter: ${err instanceof Error ? err.message : err}`);
  }
  if (!visitors) {
    try {
      visitors = await getVisitorSummary();
      if (!visitors) console.log('         (no AMPLITUDE_SECRET_KEY — visitors section omitted)');
    } catch (err) {
      console.warn(`[Weekly] ⚠ Could not pull visitors: ${err instanceof Error ? err.message : err}`);
    }
  }

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

  const indexedCount = indexing
    ? indexing.inspections.filter(i => /submitted and indexed|indexed, not submitted/i.test(i.coverageState)).length
    : null;

  const report = await buildReport(week, baseUrl, findings, {
    ...audit.inputs,
    gscAvailable: indexing !== null,
    coveredCategories,
    // Stored so next Sunday can show the change — whether Google is catching
    // up on crawling is the single number most worth watching week to week.
    ...(indexing && indexedCount !== null
      ? { indexing: { indexed: indexedCount, inspected: indexing.inspected } }
      : {}),
    ...(traffic ? { traffic } : {}),
    ...(visitors ? { visitors } : {}),
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

  if (report.inputs.indexing) {
    console.log(`[Weekly] Google indexes ${report.inputs.indexing.indexed}/${report.inputs.indexing.inspected} pages`);
  } else {
    console.log('[Weekly] ⚠ No Search Console credentials — indexing was NOT checked this run.');
  }
  if (report.inputs.traffic) {
    const t = report.inputs.traffic;
    console.log(`[Weekly] Search traffic, 28 days: ${t.current.impressions} impressions (prev ${t.previous.impressions}), ` +
      `${t.current.clicks} clicks (prev ${t.previous.clicks})`);
  }

  if (report.inputs.visitors) {
    const v = report.inputs.visitors;
    console.log(`[Weekly] Visitors ${v.window.start}..${v.window.end}: ${v.people} people (prev ${v.previousPeople ?? 'n/a'}, ${v.source ?? 'amplitude'}), ` +
      `${v.botsExcluded} bots excluded · ${v.channels.map(c => `${c.channel} ${c.visitors}`).join(', ') || 'no sources'}`);
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

  // ── Email ───────────────────────────────────────────────────────────────
  // The weekly summary always sends — it is this job's main output. Links are
  // built from the variables GitHub Actions provides; locally there are none,
  // and the email simply omits them.
  let emailFailed = false;
  if (noEmail) {
    console.log('\n[Weekly] ⓘ --no-email set — summary not sent.');
  } else {
    const server = process.env.GITHUB_SERVER_URL;
    const repo = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;

    const sent = await sendWeeklyEmail({
      report,
      reportUrl: server && repo ? `${server}/${repo}/blob/main/data/seo/${REPORT_PREFIX}-${week}.md` : undefined,
      runUrl: server && repo && runId ? `${server}/${repo}/actions/runs/${runId}` : undefined,
    });

    if (sent.delivered) {
      console.log(`\n[Weekly] ✓ Summary emailed (Resend id ${sent.id})`);
    } else if (sent.skipped === 'no-recipient') {
      // A legitimate local choice, not a failure.
      console.log(`\n[Weekly] ⓘ ${sent.error}`);
    } else {
      console.error(`\n[Weekly] ✗ Summary NOT delivered: ${sent.error}`);
      emailFailed = true;
    }
  }

  // The email is this job's deliverable, so failing to send it is the job
  // failing (2) — not the same as "findings worth a look" (1), which is a
  // normal outcome of a successful run.
  if (emailFailed) process.exit(2);
  process.exit(actionable.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[Weekly] ✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(2);
});
