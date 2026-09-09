/**
 * CLI wrapper for the SEO agent (Stage 1: audit + report, no fixes).
 *
 * Usage:
 *   npm run seo:audit                     # audits the current digest week
 *   npm run seo:audit -- --week=2026-W36
 *   npm run seo:audit -- --baseUrl=http://localhost:3000
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runSeoAgent } from '../seo/runSeoAgent';
import { getCurrentDigestWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';

function parseArgs(): { week: string; baseUrl?: string } {
  let week = getCurrentDigestWeek();
  let baseUrl: string | undefined;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--week=')) {
      week = arg.split('=')[1]!;
    } else if (arg.startsWith('--baseUrl=')) {
      baseUrl = arg.split('=')[1];
    }
  }

  validateWeekLabel(week);
  return { week, baseUrl };
}

async function main() {
  const { week, baseUrl } = parseArgs();
  const { summary } = await runSeoAgent({ week, baseUrl });

  console.log('');
  console.log(`[SEO] Done. ${summary.findingCount} open finding(s):`);
  for (const [severity, count] of Object.entries(summary.bySeverity)) {
    console.log(`  ${severity}: ${count}`);
  }
  console.log(`[SEO] Report: ${summary.reportPath}`);
}

main().catch((err) => {
  console.error('[SEO] ✗ Agent run failed:', err);
  process.exit(1);
});
