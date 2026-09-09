/**
 * Fan-out over all auditors. Stage 1 only runs the static (no-network) audit;
 * liveAudit (Phase 2) and gscAudit (Phase 3) plug in here later without
 * changing this function's shape.
 */

import { runStaticAudit } from './staticAudit';
import type { Finding, AuditInputs } from '../types';

export interface AuditResult {
  findings: Finding[];
  inputs: AuditInputs;
}

export async function runAudit(baseUrl: string): Promise<AuditResult> {
  const findings = await runStaticAudit(baseUrl);

  return {
    findings,
    inputs: {
      gscAvailable: false, // Phase 3
      liveChecked: false, // Phase 2
      urlsAudited: new Set(findings.map(f => f.url).filter(Boolean)).size,
      llmUsed: false, // Phase 4
    },
  };
}
