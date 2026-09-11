/**
 * Pull a Search Console snapshot and print a summary.
 *
 * Usage:
 *   npm run seo:gsc            # pull + save a snapshot
 *   npm run seo:gsc -- --verify-only   # just check the connection works
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { getGscClient, verifyGscAccess } from '../seo/gsc/client';
import { queryTotals, querySearchAnalytics, getWindows } from '../seo/gsc/searchAnalytics';
import { writeSnapshot, type GscSnapshot } from '../seo/gsc/store';

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function delta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '±0' : `+${current}`;
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`;
}

async function main() {
  const verifyOnly = process.argv.includes('--verify-only');

  const client = getGscClient();
  if (!client) {
    console.error('[GSC] ✗ No credentials. Run: npm run seo:setup-gsc -- <key.json> --write');
    process.exit(1);
  }

  const access = await verifyGscAccess(client);
  if (!access.ok) {
    console.error(`[GSC] ✗ ${access.message}`);
    process.exit(1);
  }
  console.log(`[GSC] ✓ ${access.message}`);
  if (verifyOnly) return;

  const { current, previous } = getWindows();
  console.log(`[GSC] Window: ${current.start} → ${current.end} (vs ${previous.start} → ${previous.end})`);

  const [totalsCurrent, totalsPrevious, pages, queries, queryPages] = await Promise.all([
    queryTotals(client, current),
    queryTotals(client, previous),
    querySearchAnalytics(client, current, ['page'], 1000),
    querySearchAnalytics(client, current, ['query'], 1000),
    querySearchAnalytics(client, current, ['query', 'page'], 5000),
  ]);

  const snapshot: GscSnapshot = {
    version: 1,
    pulledAtISO: new Date().toISOString(),
    siteUrl: client.siteUrl,
    windows: { current, previous },
    totals: { current: totalsCurrent, previous: totalsPrevious },
    pages,
    queries,
    queryPages,
  };

  const savedTo = await writeSnapshot(snapshot);

  console.log('');
  console.log('  clicks       ', totalsCurrent.clicks, `(${delta(totalsCurrent.clicks, totalsPrevious.clicks)} vs prev 28d)`);
  console.log('  impressions  ', totalsCurrent.impressions, `(${delta(totalsCurrent.impressions, totalsPrevious.impressions)})`);
  console.log('  ctr          ', pct(totalsCurrent.ctr));
  console.log('  avg position ', totalsCurrent.position.toFixed(1));
  console.log('  pages w/ data', pages.length);
  console.log('  queries      ', queries.length, '(only queries above Google\'s privacy threshold are returned)');
  console.log('');
  console.log(`[GSC] ✓ Snapshot saved to: ${savedTo}`);
}

main().catch((err) => {
  console.error('[GSC] ✗ Pull failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
