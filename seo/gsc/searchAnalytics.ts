/**
 * Search Analytics queries.
 *
 * Google's data lags ~2-3 days, so every window here ends `DATA_LAG_DAYS` ago
 * rather than today — otherwise the most recent days look like a traffic
 * collapse that isn't real.
 */

import type { GscClient } from './client';

export const DATA_LAG_DAYS = 3;
export const WINDOW_DAYS = 28;

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface DateWindow {
  start: string;
  end: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/** The two comparison windows: the most recent complete period, and the one before it. */
export function getWindows(windowDays = WINDOW_DAYS): { current: DateWindow; previous: DateWindow } {
  const end = daysAgo(DATA_LAG_DAYS);
  const start = daysAgo(DATA_LAG_DAYS + windowDays - 1);
  const prevEnd = daysAgo(DATA_LAG_DAYS + windowDays);
  const prevStart = daysAgo(DATA_LAG_DAYS + windowDays * 2 - 1);

  return {
    current: { start: isoDate(start), end: isoDate(end) },
    previous: { start: isoDate(prevStart), end: isoDate(prevEnd) },
  };
}

export async function querySearchAnalytics(
  client: GscClient,
  window: DateWindow,
  dimensions: string[],
  rowLimit = 1000
): Promise<GscRow[]> {
  const rows: GscRow[] = [];
  let startRow = 0;

  // Paginate only while full pages come back — GSC caps a single request at 25k.
  for (;;) {
    const res = await client.api.searchanalytics.query({
      siteUrl: client.siteUrl,
      requestBody: {
        startDate: window.start,
        endDate: window.end,
        dimensions,
        rowLimit,
        startRow,
        type: 'web',
        dataState: 'final',
      },
    });

    const page = (res.data.rows ?? []).map(r => ({
      keys: r.keys ?? [],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));

    rows.push(...page);
    if (page.length < rowLimit) break;
    startRow += rowLimit;
  }

  return rows;
}

/** Site-wide totals for a window — the headline numbers. */
export async function queryTotals(client: GscClient, window: DateWindow): Promise<{
  clicks: number; impressions: number; ctr: number; position: number; days: number;
}> {
  const rows = await querySearchAnalytics(client, window, ['date'], 1000);

  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  // Position must be impression-weighted; a plain mean over days would let a
  // single low-traffic day distort the figure.
  const weightedPosition = impressions > 0
    ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
    : 0;

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: weightedPosition,
    days: rows.length,
  };
}
