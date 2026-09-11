/**
 * Self-repair: find breakage, attempt a fix, verify it, open it for review.
 *
 * Dry run by default — it will do everything including verification, then
 * discard the work. Pass --ship to actually push a branch and open a PR.
 *
 * Usage:
 *   npm run seo:repair                 # detect + attempt + verify, discard
 *   npm run seo:repair -- --ship       # ...and open a PR if it verifies
 *   npm run seo:repair -- --code=LIVE_CANONICAL_MISSING   # target one defect
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runMonitor } from '../seo/monitor/runMonitor';
import { runRepair } from '../seo/repair/runRepair';
import { getAuthority, describeAuthority, assertGuardrails } from '../seo/authority';

const CANONICAL_URL = 'https://luxury-intel.com';

async function main() {
  const args = process.argv.slice(2);

  // Verified before anything else: if the limits have been weakened this
  // throws and nothing runs.
  assertGuardrails();

  const authority = getAuthority();
  console.log(`[Repair] Authority: ${describeAuthority(authority)}`);

  // --ship forces shipping for a local run; otherwise authority decides.
  const ship = args.includes('--ship') || authority.canOpenPullRequests;
  const only = args.find(a => a.startsWith('--code='))?.split('=')[1];
  const baseUrl = args.find(a => a.startsWith('--baseUrl='))?.split('=')[1]
    ?? process.env.SEO_BASE_URL
    ?? CANONICAL_URL;

  console.log(`[Repair] Scanning ${baseUrl} for repairable breakage...`);

  const monitorResult = await runMonitor(baseUrl);
  let findings = monitorResult.problems;
  if (only) findings = findings.filter(f => f.code === only);

  if (findings.length === 0) {
    console.log('[Repair] ✓ Nothing to repair — no critical or high-severity problems.');
    return;
  }

  console.log(`[Repair] ${findings.length} problem(s) detected.`);
  if (!ship) {
    console.log('[Repair] ⓘ Dry run — work will be verified then discarded. Pass --ship to open a PR.');
  }

  const { attempted, escalations } = await runRepair({ findings, baseUrl, ship });

  console.log('\n' + '─'.repeat(64));
  for (const outcome of attempted) {
    const mark = outcome.status === 'shipped' ? '✓' : outcome.status === 'skipped' ? 'ⓘ' : '✗';
    console.log(`${mark} ${outcome.finding.code}: ${outcome.status} — ${outcome.reason}`);
    if (outcome.prUrl) console.log(`  ${outcome.prUrl}`);
  }

  if (escalations.length > 0) {
    console.log(`\nNeeds a human (${escalations.length}):`);
    for (const e of escalations) {
      console.log(`  • ${e.finding.code}${e.finding.url ? ` (${e.finding.url})` : ''}`);
      console.log(`    ${e.reason}`);
    }
  }

  const shipped = attempted.filter(a => a.status === 'shipped').length;
  console.log(`\n[Repair] Done. ${shipped} repair(s) opened for review.`);
}

main().catch((err) => {
  console.error('[Repair] ✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
