/**
 * Pulling a Search Console snapshot, and the compact traffic summary the
 * weekly report keeps.
 *
 * One implementation for `npm run seo:gsc` and the Sunday pass. Before the
 * weekly pass pulled one, snapshots existed only when someone remembered to
 * run the command — one in the first three weeks — even though store.ts was
 * written on the premise that they were captured every run.
 */

import type { GscClient } from './client';
import { queryTotals, querySearchAnalytics, getWindows } from './searchAnalytics';
import type { GscSnapshot } from './store';
import type { TrafficSummary } from '../types';

export async function pullSnapshot(client: GscClient): Promise<GscSnapshot> {
  const { current, previous } = getWindows();

  const [totalsCurrent, totalsPrevious, pages, queries, queryPages] = await Promise.all([
    queryTotals(client, current),
    queryTotals(client, previous),
    querySearchAnalytics(client, current, ['page'], 1000),
    querySearchAnalytics(client, current, ['query'], 1000),
    querySearchAnalytics(client, current, ['query', 'page'], 5000),
  ]);

  return {
    version: 1,
    pulledAtISO: new Date().toISOString(),
    siteUrl: client.siteUrl,
    windows: { current, previous },
    totals: { current: totalsCurrent, previous: totalsPrevious },
    pages,
    queries,
    queryPages,
  };
}

const TOP_PAGES = 3;
const TOP_QUERIES = 5;

/**
 * What the weekly report stores and the email shows. Kept small on purpose:
 * the full snapshot is committed alongside in data/seo/gsc/.
 *
 * The comparison is the current 28 days against the 28 before, from the same
 * snapshot, rather than against last week's report: consecutive rolling
 * windows share 21 of 28 days, so a week-over-week change would mostly be
 * measuring noise.
 */
export function summariseTraffic(snapshot: GscSnapshot): TrafficSummary {
  const toPath = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') || '/';

  return {
    window: snapshot.windows.current,
    current: {
      impressions: snapshot.totals.current.impressions,
      clicks: snapshot.totals.current.clicks,
      position: snapshot.totals.current.position,
    },
    previous: {
      impressions: snapshot.totals.previous.impressions,
      clicks: snapshot.totals.previous.clicks,
      position: snapshot.totals.previous.position,
    },
    pagesWithImpressions: snapshot.pages.length,
    topPages: [...snapshot.pages]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, TOP_PAGES)
      .map(r => ({ path: toPath(r.keys[0] ?? ''), impressions: r.impressions, clicks: r.clicks, position: r.position })),
    topQueries: [...snapshot.queries]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, TOP_QUERIES)
      .map(r => ({ query: r.keys[0] ?? '', impressions: r.impressions, clicks: r.clicks, position: r.position })),
  };
}
