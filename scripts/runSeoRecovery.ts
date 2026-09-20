/**
 * Automated recovery — detect a site outage and roll production back.
 *
 * Read-only by default: it will diagnose and tell you exactly what it would
 * do. Pass --act to let it actually perform the rollback.
 *
 * Usage:
 *   npm run seo:recover                 # diagnose only
 *   npm run seo:recover -- --act        # diagnose and roll back if needed
 *   npm run seo:recover -- --check-auth # verify Vercel credentials, touch nothing
 *   npm run seo:recover -- --no-email   # don't email the outcome
 *
 * Exit codes: 0 = healthy or recovered, 1 = still broken, 2 = could not run.
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runRecovery } from '../seo/recovery/runRecovery';
import { sendRecoveryEmail } from '../seo/recovery/notify';
import { isAuthenticated, listProductionDeployments, chooseRollbackTarget } from '../seo/recovery/vercel';
import { getAuthority, describeAuthority, assertGuardrails } from '../seo/authority';

const CANONICAL_URL = 'https://luxury-intel.com';

/**
 * Prove the credentials work before an incident depends on them.
 *
 * Recovery only runs when the site is already broken, so a bad or expired
 * token would otherwise be discovered at the worst possible moment. This
 * reads deployments and decides a target without acting on anything.
 */
async function checkAuth(): Promise<void> {
  if (!(await isAuthenticated())) {
    console.error('[Recovery] ✗ The Vercel CLI has no usable credentials.');
    console.error('  In CI: check the VERCEL_TOKEN secret exists and has not expired.');
    console.error('  Locally: run `vercel login`.');
    process.exit(2);
  }

  const deployments = await listProductionDeployments();
  console.log(`[Recovery] ✓ Vercel credentials work. ${deployments.length} production deployment(s) visible.`);
  for (const d of deployments.slice(0, 3)) {
    console.log(`    ${d.status.padEnd(7)} ${d.age.padEnd(6)} ${d.url}`);
  }

  const choice = chooseRollbackTarget(deployments);
  console.log(choice.target
    ? `[Recovery] ✓ A rollback target is available: ${choice.target.url}\n    ${choice.reason}`
    : `[Recovery] ⚠ No rollback target right now. ${choice.reason}`);

  // Not a failure: "nothing to roll back to" is a real, valid state, and this
  // check is about the credentials.
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  assertGuardrails();

  if (args.includes('--check-auth')) return checkAuth();

  const authority = getAuthority();
  console.log(`[Recovery] Authority: ${describeAuthority(authority)}`);

  const act = args.includes('--act') || authority.canRollbackDeployments;
  const baseUrl = args.find(a => a.startsWith('--baseUrl='))?.split('=')[1]
    ?? process.env.SEO_BASE_URL
    ?? CANONICAL_URL;

  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)) {
    console.error('[Recovery] ✗ Refusing to run against a local URL — this controls production deployments.');
    process.exit(2);
  }

  console.log(`[Recovery] Probing ${baseUrl}...`);
  if (!act) console.log('[Recovery] ⓘ Diagnose only — pass --act to allow a rollback.');

  const result = await runRecovery(baseUrl, act, authority.canRevertCommits);

  const mark = result.status === 'healthy' || result.status === 'rolled-back' ? '✓' : '✗';
  console.log(`\n[Recovery] ${mark} ${result.status.toUpperCase()}`);
  console.log(`  ${result.detail}`);

  if (result.failedUrls.length > 0) {
    console.log(`\n  Failing pages (${result.failedUrls.length}/${result.sampledUrls} sampled):`);
    for (const u of result.failedUrls.slice(0, 8)) console.log(`    • ${u}`);
  }

  console.log(`\n  → ${result.recommendation}`);

  // Emailed because this is the one part of the system that changes production
  // on its own. A rollback nobody hears about leaves publishing frozen.
  if (!args.includes('--no-email')) {
    const sent = await sendRecoveryEmail(result);
    if (sent.delivered) console.log(`[Recovery] ✓ Outcome emailed (Resend id ${sent.id})`);
    else if (sent.skipped === 'nothing-to-report') console.log('[Recovery] ⓘ Healthy — nothing emailed.');
    else if (sent.skipped === 'no-recipient') console.log(`[Recovery] ⓘ ${sent.error}`);
    else console.error(`[Recovery] ✗ Outcome NOT emailed: ${sent.error}`);
  }

  const bad = result.status === 'rollback-failed'
    || result.status === 'no-target'
    || result.status === 'would-roll-back'
    || result.status === 'provider-outage'
    || result.status === 'not-authenticated';
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error('[Recovery] ✗ Could not run:', err instanceof Error ? err.message : err);
  process.exit(2);
});
