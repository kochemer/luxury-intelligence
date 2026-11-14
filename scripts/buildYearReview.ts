/**
 * Build the year in review data (data/review/<year>.json).
 *
 * Usage:
 *   npm run review:build                      # fetch prices, label new headlines, build
 *   npm run review:build -- --offline         # cached prices and labels only
 *   npm run review:build -- --end=2026-11-09  # exclusive end, a Monday
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { buildYearReview } from '../review/build';

async function main() {
  const args = process.argv.slice(2);
  const end = args.find(a => a.startsWith('--end='))?.split('=')[1];
  const endMs = end ? new Date(`${end}T00:00:00Z`).getTime() : undefined;
  if (end && (!Number.isFinite(endMs) || new Date(endMs!).getUTCDay() !== 1)) throw new Error(`--end must be a Monday (YYYY-MM-DD): ${end}`);

  const { review: r, labelled, costUsd, failedTickers, unlabelled } = await buildYearReview({ endMs, offline: args.includes('--offline') });

  console.log(`\n[Review] ✓ ${r.window.startISO} → ${r.window.endISO} (${r.window.weeks} weeks)`);
  console.log(`  archive ${r.archive.articles} articles / ${r.archive.sources} sources · panel ${r.panel.articles} / ${r.panel.sources}`);
  console.log(`  labelled ${labelled} new headline(s), $${costUsd.toFixed(2)}${unlabelled ? ` · ${unlabelled} still unlabelled` : ''}${failedTickers.length ? ` · prices failed: ${failedTickers.join(', ')}` : ''}`);
  console.log('\n  Company           articles   YTD');
  for (const c of r.companies) console.log(`  ${c.company.padEnd(16)} ${String(c.articles).padStart(8)} ${(c.changeYtd > 0 ? '+' : '') + c.changeYtd}%`);
  console.log(`\n  Backtest on ${r.backtest.companies.join(', ')}`);
  for (const [label, rows] of [['direction', r.backtest.direction], ['size', r.backtest.size]] as const) {
    console.log(`  ${label.padEnd(10)} ${rows.map(s => `${s.lag > 0 ? '+' : ''}${s.lag}:${s.r.toFixed(2)}${s.p < 0.05 ? '*' : ''}`).join('  ')}`);
  }
  console.log(`\n  Themes (${r.themes.articles} articles, ${r.themes.outlets.length} outlets, ${r.themes.unlabelled}% no theme)`);
  for (const t of [...r.themes.rows].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))) {
    console.log(`  ${(t.background ? '(bg) ' : '') + t.name.padEnd(32)} ${String(t.firstHalf).padStart(5)}% → ${String(t.secondHalf).padStart(5)}%  n=${t.articles}`);
  }
}

main().catch(err => {
  console.error('[Review] ✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
