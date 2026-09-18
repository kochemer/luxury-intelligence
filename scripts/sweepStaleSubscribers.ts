/**
 * Nightly cleanup of abandoned checkouts (IMPROVEMENTS.md → "Stale planType:'none'").
 *
 *   npx tsx scripts/sweepStaleSubscribers.ts            # apply
 *   npx tsx scripts/sweepStaleSubscribers.ts --dry-run  # report only
 *   npx tsx scripts/sweepStaleSubscribers.ts --hours=48
 *
 * planType='none' rows older than the cutoff with no Stripe subscription are
 * promoted to 'free' if they opted into the digest, otherwise deleted.
 * Requires DATABASE_URL.
 */

import { loadEnv } from '../lib/env';
import { sweepStaleNoneSubscribers } from '../lib/db/subscribers';

loadEnv();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const hoursArg = args.find(a => a.startsWith('--hours='))?.split('=')[1];
  const olderThanHours = hoursArg ? Number(hoursArg) : 24;
  if (!Number.isFinite(olderThanHours) || olderThanHours <= 0) throw new Error(`Bad --hours: ${hoursArg}`);

  const result = await sweepStaleNoneSubscribers({ olderThanHours, dryRun });
  const mode = dryRun ? 'DRY RUN' : 'applied';
  console.log(`[Sweep] ${mode} · cutoff ${olderThanHours}h · promoted ${result.promoted.length} · deleted ${result.deleted.length}`);
  // Mask addresses in CI logs: local-part initial + domain.
  const mask = (e: string) => e.includes('@') ? `${e[0]}…@${e.split('@')[1]}` : e;
  for (const e of result.promoted) console.log(`  promoted → free: ${mask(e)}`);
  for (const e of result.deleted)  console.log(`  deleted:         ${mask(e)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
