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

/**
 * Send a clearly-labelled test alert through the real delivery path.
 *
 * Exists because transition-based alerting on a healthy site never sends
 * anything — so "no email" is indistinguishable from "email is broken". That
 * ambiguity hid a real bug: the sender ignored Resend's error response and
 * reported success. The only way to know alerting works is to use it.
 */
async function sendTestAlert(): Promise<void> {
  const now = new Date().toISOString();
  const ok = await sendAlert({
    checkedAtISO: now,
    siteUrl: CANONICAL_URL,
    healthy: false,
    problems: [],
    newProblems: [{
      id: 'TEST_ALERT:test',
      code: 'TEST_ALERT',
      severity: 'info',
      category: 'technical',
      title: 'This is a test alert — nothing is wrong with your site',
      detail: 'Sent by `npm run seo:monitor -- --test-alert` to confirm alert emails are delivered. ' +
              'Your site has not been checked by this message and no action is needed.',
      recommendation: 'None. If you received this, alerting works.',
      score: 0,
      firstSeenWeek: '',
      weeksOpen: 1,
    }],
    resolvedProblems: [],
    trafficNote: null,
  });

  if (ok) {
    console.log('[Monitor] ✓ Test alert accepted by Resend. Check the inbox (and spam) for it.');
    process.exit(0);
  }
  console.error('[Monitor] ✗ Test alert was NOT delivered — see the error above. Real alerts would fail the same way.');
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--test-alert')) return sendTestAlert();
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
  let alertFailed = false;
  if (somethingChanged && !noAlert) {
    alerted = await sendAlert(result);
    alertFailed = !alerted && Boolean(process.env.SEO_ALERT_EMAIL);
  } else if (!somethingChanged) {
    console.log('[Monitor] ⓘ No change since last check — no alert sent.');
  }

  // If the alert failed, do NOT record these problems as known. State is what
  // makes alerting transition-based: once a problem is in openProblemIds, the
  // next run sees "no change" and stays silent. Advancing state after a failed
  // send would therefore lose the alert permanently — the problem would be
  // "already reported" to nobody. Keeping the previous state means the next
  // run sees the same change and tries again.
  await writeState({
    version: 1,
    lastCheckedISO: result.checkedAtISO,
    openProblemIds: alertFailed ? state.openProblemIds : result.problems.map(p => p.id),
    lastAlertISO: alerted ? result.checkedAtISO : state.lastAlertISO,
    consecutiveHealthyRuns: result.healthy ? state.consecutiveHealthyRuns + 1 : 0,
  });
  console.log(`[Monitor] State saved to: ${STATE_PATH}`);

  if (alertFailed) {
    // Found something and could not tell anyone: that is the monitor failing
    // at its one job, so it must fail CI loudly rather than exit as "site has
    // problems" (1), which the workflow treats as a normal outcome.
    console.error('[Monitor] ✗ Problems were found but the alert could not be delivered. Will retry next run.');
    process.exit(2);
  }

  process.exit(result.healthy ? 0 : 1);
}

main().catch((err) => {
  console.error('[Monitor] ✗ Monitor failed to run:', err instanceof Error ? err.message : err);
  process.exit(2);
});
