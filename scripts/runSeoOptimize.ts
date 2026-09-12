/**
 * Best-practice scorer — finds opportunities, not defects.
 *
 * Every other audit here asks "is something wrong?". This asks "what could be
 * better?", against the internal-linking, heading-structure and content-depth
 * checks from the `seo-audit` skill.
 *
 * Usage:
 *   npm run seo:optimize
 *   npm run seo:optimize -- --graph      # also print the inbound-link table
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { analyseLinkGraph } from '../seo/optimize/linkGraph';
import { runAssetAudit } from '../seo/optimize/assetAudit';

const CANONICAL_URL = 'https://luxury-intel.com';

async function main() {
  const args = process.argv.slice(2);
  const showGraph = args.includes('--graph');
  const baseUrl = args.find(a => a.startsWith('--baseUrl='))?.split('=')[1] ?? CANONICAL_URL;

  console.log(`[Optimise] Analysing internal link graph and page structure on ${baseUrl}...`);

  // Both run in parallel: the link graph reads markup, the asset audit reads
  // byte sizes, and neither depends on the other.
  const [result, assets] = await Promise.all([
    analyseLinkGraph(baseUrl),
    runAssetAudit(baseUrl),
  ]);
  result.findings.push(...assets.findings);

  console.log(
    `[Optimise] ✓ Analysed ${result.pagesAnalysed} pages, measured ${assets.assetsMeasured} assets\n`
  );

  const order = ['critical', 'high', 'medium', 'low', 'info'] as const;
  for (const severity of order) {
    const group = result.findings.filter(f => f.severity === severity);
    if (group.length === 0) continue;

    const byCode = new Map<string, typeof group>();
    for (const f of group) {
      if (!byCode.has(f.code)) byCode.set(f.code, []);
      byCode.get(f.code)!.push(f);
    }

    console.log(`${severity.toUpperCase()} (${group.length})`);
    for (const [code, items] of byCode) {
      console.log(`  ${code} ×${items.length}`);
      console.log(`    ${items[0]!.title}`);
      console.log(`    ${items[0]!.detail.slice(0, 200)}`);
      console.log(`    → ${items[0]!.recommendation}`);
      if (items.length > 1) {
        const urls = items.map(i => i.url).filter(Boolean).slice(0, 4);
        if (urls.length > 0) {
          console.log(`    affected: ${urls.join(', ')}${items.length > 4 ? ` +${items.length - 4} more` : ''}`);
        }
      }
      console.log('');
    }
  }

  if (showGraph) {
    console.log('Inbound internal links per page (fewest first):\n');
    const sorted = [...result.nodes].sort((a, b) => a.inbound.length - b.inbound.length);
    for (const node of sorted) {
      const path = node.url.replace(baseUrl, '') || '/';
      console.log(`  ${String(node.inbound.length).padStart(3)} in / ${String(node.outbound).padStart(3)} out  ${path}`);
    }
    console.log('');
  }

  const orphans = result.findings.filter(f => f.code === 'OPT_ORPHAN_PAGE').length;
  console.log(`[Optimise] ${result.findings.length} opportunities. ${orphans} orphan page(s).`);
  if (orphans > 0) {
    console.log('[Optimise] ⓘ Orphans are the likeliest explanation for pages Google has never crawled.');
  }
}

main().catch((err) => {
  console.error('[Optimise] ✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
