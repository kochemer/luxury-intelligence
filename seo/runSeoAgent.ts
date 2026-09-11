/**
 * Stage 1 orchestrator: audit → score/delta → write report. No fixes applied,
 * no network calls, no LLM. Later stages (live HTTP, GSC, auto-fix, agentic
 * code changes) plug into this same shape without changing its signature.
 */

import { getSiteUrl } from '@/lib/utils/siteUrl';
import { runAudit } from './audit/runAudit';
import { buildReport } from './report/buildReport';
import { writeReport } from './report/writeReport';
import type { SeoReport } from './types';

export interface RunSeoAgentOptions {
  week: string;
  baseUrl?: string;
  skipLive?: boolean;
}

export interface SeoAgentSummary {
  week: string;
  findingCount: number;
  bySeverity: Record<string, number>;
  reportPath: string;
  gscAvailable: boolean;
}

export async function runSeoAgent(options: RunSeoAgentOptions): Promise<{ report: SeoReport; summary: SeoAgentSummary }> {
  const baseUrl = options.baseUrl ?? getSiteUrl();

  console.log(`[SEO] Auditing ${baseUrl} for ${options.week}...`);
  const { findings, inputs } = await runAudit({ baseUrl, skipLive: options.skipLive });
  console.log(
    `[SEO] ✓ ${findings.length} finding(s)` +
    (inputs.liveChecked ? ` (static + ${inputs.urlsFetched} pages fetched)` : ' (static only)')
  );

  const report = await buildReport(options.week, baseUrl, findings, inputs);
  const { jsonPath } = await writeReport(report);

  const bySeverity: Record<string, number> = {};
  for (const f of report.findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  }

  console.log(`[SEO] Score: ${report.score.overall} (${report.delta.scoreChange >= 0 ? '+' : ''}${report.delta.scoreChange})`);

  return {
    report,
    summary: {
      week: options.week,
      findingCount: report.findings.length,
      bySeverity,
      reportPath: jsonPath,
      gscAvailable: inputs.gscAvailable,
    },
  };
}
