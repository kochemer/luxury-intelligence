/**
 * Fan-out over all auditors.
 *
 * Stage 1 = static (no-network) checks. Stage 2 adds live HTTP checks against
 * the deployed site. gscAudit (Stage 3) plugs in here later without changing
 * this function's shape.
 */

import { runStaticAudit } from './staticAudit';
import { runLiveAudit } from './liveAudit';
import type { Finding, AuditInputs, Category } from '../types';

export interface AuditResult {
  findings: Finding[];
  inputs: AuditInputs;
}

export interface RunAuditOptions {
  baseUrl: string;
  /** Skip live HTTP checks (offline runs, or when you only want repo-static signal). */
  skipLive?: boolean;
}

/**
 * Static checks that a live check supersedes for the same URL.
 *
 * The static pass predicts a page's title/description by running the same
 * builders the app uses; the live pass reads what the server actually served.
 * When both ran, the live result is ground truth, and keeping both would
 * double-count one problem — inflating the volume penalty and handing a future
 * auto-fix stage two tickets for one fix.
 */
const SUPERSEDED_BY_LIVE: Record<string, string> = {
  STATIC_TITLE_LENGTH: 'LIVE_TITLE_LENGTH',
  STATIC_META_DESC_LENGTH: 'LIVE_DESC_LENGTH',
};

function dedupeAgainstLive(staticFindings: Finding[], liveFindings: Finding[]): Finding[] {
  const liveKeys = new Set(liveFindings.map(f => `${f.code}|${f.url ?? ''}`));

  return staticFindings.filter(f => {
    const liveEquivalent = SUPERSEDED_BY_LIVE[f.code];
    if (!liveEquivalent) return true;
    return !liveKeys.has(`${liveEquivalent}|${f.url ?? ''}`);
  });
}

export async function runAudit({ baseUrl, skipLive }: RunAuditOptions): Promise<AuditResult> {
  const staticResult = await runStaticAudit(baseUrl);

  // Auditing localhost tells you nothing about what Google sees, and a dev
  // server may not even be running — skip unless explicitly pointed there.
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl);
  const doLive = !skipLive && !isLocal;

  if (isLocal && !skipLive) {
    console.log('[SEO] ⓘ Skipping live HTTP checks — baseUrl is localhost.');
  }

  const liveResult = doLive ? await runLiveAudit(baseUrl) : null;

  const coveredCategories = Array.from(
    new Set<Category>([
      ...staticResult.coveredCategories,
      ...(liveResult?.coveredCategories ?? []),
    ])
  );

  const staticFindings = liveResult
    ? dedupeAgainstLive(staticResult.findings, liveResult.findings)
    : staticResult.findings;

  return {
    findings: [...staticFindings, ...(liveResult?.findings ?? [])],
    inputs: {
      gscAvailable: false, // Stage 3
      liveChecked: liveResult !== null,
      urlsAudited: staticResult.urlsAudited,
      urlsMetaChecked: staticResult.urlsMetaChecked,
      urlsFetched: liveResult?.urlsFetched ?? 0,
      llmUsed: false, // Stage 4
      coveredCategories,
    },
  };
}
