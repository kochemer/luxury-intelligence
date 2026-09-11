/**
 * Automated recovery — detect a site outage and roll production back.
 *
 * Read-only by default: it will diagnose and tell you exactly what it would
 * do. Pass --act to let it actually perform the rollback.
 *
 * Usage:
 *   npm run seo:recover              # diagnose only
 *   npm run seo:recover -- --act     # diagnose and roll back if needed
 *
 * Exit codes: 0 = healthy or recovered, 1 = still broken, 2 = could not run.
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runRecovery } from '../seo/recovery/runRecovery';

const CANONICAL_URL = 'https://luxury-intel.com';

async function main() {
  const args = process.argv.slice(2);
  const act = args.includes('--act');
  const baseUrl = args.find(a => a.startsWith('--baseUrl='))?.split('=')[1]
    ?? process.env.SEO_BASE_URL
    ?? CANONICAL_URL;

  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)) {
    console.error('[Recovery] ✗ Refusing to run against a local URL — this controls production deployments.');
    process.exit(2);
  }

  console.log(`[Recovery] Probing ${baseUrl}...`);
  if (!act) console.log('[Recovery] ⓘ Diagnose only — pass --act to allow a rollback.');

  const result = await runRecovery(baseUrl, act);

  const mark = result.status === 'healthy' || result.status === 'rolled-back' ? '✓' : '✗';
  console.log(`\n[Recovery] ${mark} ${result.status.toUpperCase()}`);
  console.log(`  ${result.detail}`);

  if (result.failedUrls.length > 0) {
    console.log(`\n  Failing pages (${result.failedUrls.length}/${result.sampledUrls} sampled):`);
    for (const u of result.failedUrls.slice(0, 8)) console.log(`    • ${u}`);
  }

  console.log(`\n  → ${result.recommendation}`);

  const bad = result.status === 'rollback-failed'
    || result.status === 'no-target'
    || result.status === 'provider-outage';
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error('[Recovery] ✗ Could not run:', err instanceof Error ? err.message : err);
  process.exit(2);
});
