/**
 * Daily SEO breakage monitor.
 *
 * Answers "is something broken right now?" — not "could this be better?".
 * Alerts only on transitions (newly broken / recovered), so healthy days are
 * silent and the alert stays meaningful.
 *
 * Usage:
 *   npm run seo:monitor
 *   npm run seo:monitor -- --baseUrl=https://luxury-intel.com
 *   npm run seo:monitor -- --no-alert     # check and print, never email
 *
 * Exit codes: 0 = healthy, 1 = problems found, 2 = the monitor itself failed.
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runMonitor } from '../seo/monitor/runMonitor';
import { readState, writeState, STATE_PATH } from '../seo/monitor/state';
import { sendAlert } from '../seo/monitor/alert';

/**
 * The monitor always targets production by default — deliberately NOT
 * getSiteUrl(), which resolves NEXT_PUBLIC_SITE_URL and is therefore
 * http://localhost:3000 during local development. An unattended monitor that
 * silently checks a dev server reports the live site as catastrophically
 * broken (52 false 404s, in the run that caught this). Same reasoning as the
 * CANONICAL_URL constant in lib/email/transactional.ts.
 */
const CANONICAL_URL = 'https://luxury-intel.com';

function isLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url);
}

async function main() {
  const args = process.argv.slice(2);
  const noAlert = args.includes('--no-alert');
  const allowLocalhost = args.includes('--allow-localhost');
  const baseUrl = args.find(a => a.startsWith('--baseUrl='))?.split('=')[1]
    ?? process.env.SEO_BASE_URL
    ?? CANONICAL_URL;

  if (isLocal(baseUrl) && !allowLocalhost) {
    console.error(`[Monitor] ✗ Refusing to monitor a local URL: ${baseUrl}`);
    console.error('  The monitor is for production. A dev server that is simply not');
    console.error('  running would otherwise be reported as a site-wide outage.');
    console.error('  Pass --allow-localhost if you genuinely intend to check locally.');
    process.exit(2);
  }

  console.log(`[Monitor] Checking ${baseUrl}...`);

  const state = await readState();
  const result = await runMonitor(baseUrl, state.openProblemIds);

  if (result.healthy) {
    console.log('[Monitor] ✓ Healthy — no critical or high-severity problems.');
  } else {
    console.log(`[Monitor] ✗ ${result.problems.length} problem(s), ${result.newProblems.length} new:`);
    for (const p of result.problems) {
      const tag = result.newProblems.includes(p) ? 'NEW' : 'ongoing';
      console.log(`  [${p.severity.toUpperCase()}/${tag}] ${p.title}${p.url ? ` — ${p.url}` : ''}`);
    }
  }
  if (result.trafficNote) console.log(`[Monitor] Search Console: ${result.trafficNote}`);

  // Alert only when something changed. A daily email that says "still fine"
  // trains you to ignore it, and then it's useless on the day it matters.
  const somethingChanged = result.newProblems.length > 0 || result.resolvedProblems.length > 0;
  let alerted = false;
  if (somethingChanged && !noAlert) {
    alerted = await sendAlert(result);
  } else if (!somethingChanged) {
    console.log('[Monitor] ⓘ No change since last check — no alert sent.');
  }

  await writeState({
    version: 1,
    lastCheckedISO: result.checkedAtISO,
    openProblemIds: result.problems.map(p => p.id),
    lastAlertISO: alerted ? result.checkedAtISO : state.lastAlertISO,
    consecutiveHealthyRuns: result.healthy ? state.consecutiveHealthyRuns + 1 : 0,
  });
  console.log(`[Monitor] State saved to: ${STATE_PATH}`);

  process.exit(result.healthy ? 0 : 1);
}

main().catch((err) => {
  console.error('[Monitor] ✗ Monitor failed to run:', err instanceof Error ? err.message : err);
  process.exit(2);
});
