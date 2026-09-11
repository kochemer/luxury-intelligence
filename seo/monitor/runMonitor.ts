/**
 * Daily breakage monitor.
 *
 * Deliberately narrow: this answers "is something broken right now?", not
 * "could this be better?". Cosmetic findings (title length, description
 * length, alt text) are explicitly excluded — an alert channel that fires for
 * non-urgent things gets muted, and then it's worthless when it matters.
 *
 * Only `critical` and `high` severity findings are alertable, plus a traffic
 * cliff derived from Search Console snapshots.
 *
 * No LLM, no cost, runs in seconds.
 */

import { runLiveAudit } from '../audit/liveAudit';
import { getGscClient } from '../gsc/client';
import { queryTotals, getWindows } from '../gsc/searchAnalytics';
import { TRAFFIC_CLIFF_DROP_PCT, TRAFFIC_CLIFF_MIN_IMPRESSIONS } from '../config';
import type { Finding } from '../types';

export interface MonitorResult {
  checkedAtISO: string;
  siteUrl: string;
  healthy: boolean;
  problems: Finding[];
  /** Problems seen for the first time in this run (not in the previous state). */
  newProblems: Finding[];
  /** Problems present previously but now gone. */
  resolvedProblems: string[];
  trafficNote: string | null;
}

/**
 * Search Console traffic cliff detection.
 *
 * Gated behind a minimum impression count: on a low-traffic site a "50% drop"
 * can be four impressions becoming two, which is noise, not an incident.
 */
async function checkTrafficCliff(): Promise<{ finding: Finding | null; note: string | null }> {
  const client = getGscClient();
  if (!client) return { finding: null, note: null };

  try {
    const { current, previous } = getWindows();
    const [now, before] = await Promise.all([
      queryTotals(client, current),
      queryTotals(client, previous),
    ]);

    const note = `${now.impressions} impressions / ${now.clicks} clicks over 28d (prev ${before.impressions} / ${before.clicks})`;

    if (before.impressions < TRAFFIC_CLIFF_MIN_IMPRESSIONS) {
      return { finding: null, note: `${note} — below the ${TRAFFIC_CLIFF_MIN_IMPRESSIONS}-impression threshold for cliff detection` };
    }

    const dropPct = ((before.impressions - now.impressions) / before.impressions) * 100;
    if (dropPct < TRAFFIC_CLIFF_DROP_PCT) return { finding: null, note };

    return {
      note,
      finding: {
        id: 'GSC_TRAFFIC_CLIFF:site',
        code: 'GSC_TRAFFIC_CLIFF',
        severity: 'critical',
        category: 'opportunity',
        title: `Search impressions dropped ${dropPct.toFixed(0)}%`,
        detail: `Impressions fell from ${before.impressions} to ${now.impressions} between the previous and current 28-day windows.`,
        recommendation: 'Check Search Console for manual actions, an indexing drop, or a recent deploy that changed canonicals or robots rules.',
        evidence: { current: now.impressions, previous: before.impressions, dropPct },
        score: 0,
        firstSeenWeek: '',
        weeksOpen: 1,
      },
    };
  } catch (err) {
    // A GSC outage must not make the monitor report the site as broken.
    return { finding: null, note: `Search Console unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function runMonitor(baseUrl: string, previousProblemIds: string[] = []): Promise<MonitorResult> {
  const [liveResult, traffic] = await Promise.all([
    runLiveAudit(baseUrl),
    checkTrafficCliff(),
  ]);

  const problems = [
    ...liveResult.findings.filter(f => f.severity === 'critical' || f.severity === 'high'),
    ...(traffic.finding ? [traffic.finding] : []),
  ];

  const previousSet = new Set(previousProblemIds);
  const currentIds = new Set(problems.map(p => p.id));

  return {
    checkedAtISO: new Date().toISOString(),
    siteUrl: baseUrl,
    healthy: problems.length === 0,
    problems,
    newProblems: problems.filter(p => !previousSet.has(p.id)),
    resolvedProblems: previousProblemIds.filter(id => !currentIds.has(id)),
    trafficNote: traffic.note,
  };
}
