/**
 * Emits the static audit's finding ids as JSON on stdout.
 *
 * Exists so the repair verifier can re-audit in a *fresh process*. The verifier
 * runs inside a process that already imported the audit modules, and Node
 * caches modules — so an in-process re-audit would keep executing the code as
 * it was before the agent edited it, and could never observe the repair. A
 * subprocess re-imports from disk and sees the actual current state.
 *
 * Usage:  npx tsx scripts/auditJson.ts --baseUrl=https://luxury-intel.com
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { runStaticAudit } from '../seo/audit/staticAudit';

async function main() {
  const baseUrl = process.argv.slice(2)
    .find(a => a.startsWith('--baseUrl='))?.split('=')[1]
    ?? 'https://luxury-intel.com';

  const result = await runStaticAudit(baseUrl);

  // stdout carries only JSON so the caller can parse it without scraping logs.
  process.stdout.write(JSON.stringify({
    findings: result.findings.map(f => ({
      id: f.id,
      code: f.code,
      severity: f.severity,
      url: f.url ?? null,
    })),
  }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
