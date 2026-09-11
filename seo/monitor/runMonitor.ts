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

import { runAudit } from '../audit/runAudit';
import { getGscClient } from '../gsc/client';
import { queryTotals, getWindows } from '../gsc/searchAnalytics';
import { TRAFFIC_CLIFF_DROP_PCT, TRAFFIC_CLIFF_MIN_IMPRESSIONS, SITEMAP_STALE_DAYS } from '../config';
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

/**
 * Is Google still reading the sitemap?
 *
 * One API call, so it runs daily rather than being something a human has to
 * remember to check. This site's sitemap went unread for 214 days and nobody
 * noticed — 42 published pages were never announced and 25 were never crawled.
 * A reminder to check manually would have worked exactly as well as the
 * absence of one did.
 */
async function checkSitemapFreshness(): Promise<Finding | null> {
  const client = getGscClient();
  if (!client) return null;

  try {
    const res = await client.api.sitemaps.list({ siteUrl: client.siteUrl });
    const sitemaps = res.data.sitemap ?? [];
    if (sitemaps.length === 0) return null; // reported by the indexing audit

    const newest = sitemaps
      .map(s => ({ path: s.path, lastDownloaded: s.lastDownloaded }))
      .sort((a, b) => String(b.lastDownloaded).localeCompare(String(a.lastDownloaded)))[0]!;

    if (!newest.lastDownloaded) return null;

    const ageDays = Math.floor((Date.now() - new Date(newest.lastDownloaded).getTime()) / 86_400_000);
    if (ageDays <= SITEMAP_STALE_DAYS) return null;

    return {
      id: 'GSC_SITEMAP_STALE:monitor',
      code: 'GSC_SITEMAP_STALE',
      severity: 'high',
      category: 'indexing',
      title: `Google has not read the sitemap for ${ageDays} days`,
      detail: `${newest.path} was last downloaded by Google on ${String(newest.lastDownloaded).slice(0, 10)}. ` +
              `Pages published since then have not been announced through it.`,
      evidence: { lastDownloaded: newest.lastDownloaded, ageDays },
      recommendation: 'Run `npm run seo:indexing -- --resubmit` to ask Google to re-read it, ' +
                      'then `npm run seo:indexing` a few days later to confirm it did.',
      score: 0,
      firstSeenWeek: '',
      weeksOpen: 1,
    };
  } catch {
    // A GSC hiccup must not make the monitor report the site as broken.
    return null;
  }
}

export async function runMonitor(baseUrl: string, previousProblemIds: string[] = []): Promise<MonitorResult> {
  // Both audits, not just the live one: a digest silently missing from the
  // sitemap is genuine breakage, and it is only visible to the static checks.
  const [auditResult, traffic, sitemapStale] = await Promise.all([
    runAudit({ baseUrl }),
    checkTrafficCliff(),
    checkSitemapFreshness(),
  ]);

  const problems = [
    ...auditResult.findings.filter(f => f.severity === 'critical' || f.severity === 'high'),
    ...(traffic.finding ? [traffic.finding] : []),
    ...(sitemapStale ? [sitemapStale] : []),
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
