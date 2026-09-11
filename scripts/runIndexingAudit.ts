/**
 * Ask Google what it actually thinks of every page, and report the answer.
 *
 * Unlike the other audits, this reads nothing from the repo or the page markup
 * — it asks the Search Console API directly. That is the only way to see
 * problems that are invisible locally: pages Google declined to index, a
 * canonical Google overrode, or a sitemap it has stopped re-reading.
 *
 * Usage:
 *   npm run seo:indexing                    # inspect every URL, report
 *   npm run seo:indexing -- --resubmit      # ...and re-submit a stale sitemap
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runIndexingAudit } from '../seo/audit/indexingAudit';
import { getGscWriteClient } from '../seo/gsc/client';

const CANONICAL_URL = 'https://luxury-intel.com';

/**
 * Re-submitting is safe and idempotent: it asks Google to re-read a file it
 * already knows about, and cannot change what the file contains.
 */
async function resubmitSitemap(): Promise<void> {
  const client = getGscWriteClient();
  if (!client) {
    console.error('  ✗ No Search Console credentials.');
    return;
  }

  const feedpath = `${CANONICAL_URL}/sitemap.xml`;
  try {
    await client.api.sitemaps.submit({ siteUrl: client.siteUrl, feedpath });
    console.log(`  ✓ Re-submitted ${feedpath}`);
    console.log('    Google usually re-reads within a few days; re-run this audit to confirm.');
  } catch (err) {
    console.error(`  ✗ Re-submission failed: ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const resubmit = args.includes('--resubmit');
  const baseUrl = args.find(a => a.startsWith('--baseUrl='))?.split('=')[1] ?? CANONICAL_URL;

  console.log(`[Indexing] Asking Google about every page on ${baseUrl}...`);

  const result = await runIndexingAudit(baseUrl, (done, total) => {
    if (done % 10 === 0 || done === total) {
      process.stdout.write(`\r[Indexing] Inspected ${done}/${total} URLs...`);
    }
  });
  process.stdout.write('\n');

  if (!result) {
    console.error('[Indexing] ✗ No Search Console credentials. Run: npm run seo:setup-gsc -- <key.json> --write');
    process.exit(1);
  }

  console.log(`[Indexing] ✓ Inspected ${result.inspected} URLs\n`);

  const bySeverity = ['critical', 'high', 'medium', 'low', 'info'] as const;
  for (const severity of bySeverity) {
    const group = result.findings.filter(f => f.severity === severity);
    if (group.length === 0) continue;

    console.log(`${severity.toUpperCase()} (${group.length})`);
    // Collapse repeats: one line per problem type, with a couple of examples,
    // rather than fifty near-identical lines.
    const byCode = new Map<string, typeof group>();
    for (const f of group) {
      if (!byCode.has(f.code)) byCode.set(f.code, []);
      byCode.get(f.code)!.push(f);
    }
    for (const [code, items] of byCode) {
      console.log(`  ${code} ×${items.length}`);
      console.log(`    ${items[0]!.title}`);
      console.log(`    ${items[0]!.detail.slice(0, 190)}`);
      console.log(`    → ${items[0]!.recommendation}`);
      if (items.length > 1) {
        console.log(`    affected: ${items.slice(0, 3).map(i => i.url ?? '(site)').join(', ')}${items.length > 3 ? ` +${items.length - 3} more` : ''}`);
      }
      console.log('');
    }
  }

  const indexed = result.inspections.filter(i => /submitted and indexed|indexed, not submitted/i.test(i.coverageState)).length;
  console.log(`[Indexing] ${indexed}/${result.inspected} pages are indexed by Google.`);

  if (resubmit) {
    console.log('\n[Indexing] Re-submitting sitemap...');
    await resubmitSitemap();
  } else if (result.findings.some(f => f.code === 'GSC_SITEMAP_STALE' || f.code === 'GSC_SITEMAP_COUNT_DRIFT')) {
    console.log('\n[Indexing] ⓘ Sitemap looks stale. Re-run with --resubmit to ask Google to re-read it.');
  }
}

main().catch((err) => {
  console.error('[Indexing] ✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
