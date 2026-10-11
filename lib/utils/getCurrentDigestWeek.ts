/**
 * Shared utility to get the current week labels for digests & ingestion.
 *
 * Week computation rule (CET / Europe/Copenhagen):
 *   - getCurrentDigestWeek()  → the previous ISO week (current week on
 *     Sunday). The digest is built Monday morning for the week that just ended.
 *   - getCurrentIngestionWeek() → the week in progress, except on Monday,
 *     when it is the week that just ended (Monday's fetches close it out).
 *
 * Both return format "YYYY-Www" (zero-padded week number).
 *
 * All scripts that accept --week CLI overrides still win when provided.
 */

import { DateTime } from 'luxon';

const TZ = 'Europe/Copenhagen';
const WEEK_LABEL_RE = /^\d{4}-W\d{2}$/;

/**
 * Validate that a weekLabel matches the expected format YYYY-Www.
 * Throws if invalid (fail-fast).
 */
export function validateWeekLabel(weekLabel: string): void {
  if (!WEEK_LABEL_RE.test(weekLabel)) {
    throw new Error(
      `Invalid weekLabel format: "${weekLabel}". Expected YYYY-Www (e.g. 2026-W06).`
    );
  }
}

/**
 * Build a "YYYY-Www" label from a Luxon DateTime.
 * Uses ISO weekYear + weekNumber so Jan-1 edge cases are correct.
 */
function formatWeekLabel(dt: DateTime): string {
  const label = `${dt.weekYear}-W${dt.weekNumber.toString().padStart(2, '0')}`;
  validateWeekLabel(label);
  return label;
}

/**
 * Get the current DIGEST week label — the week whose digest the site shows.
 *
 * The weekly build runs Monday morning for the Monday–Sunday week that just
 * ended, so Monday–Saturday this is the previous week. On Sunday it is the
 * current week, which has no file until Monday's build: the homepage falls back
 * to the newest digest on disk. Keeping the Sunday switch matters because pages
 * are rendered at deploy time. A deploy on a Sunday must not pin the site to
 * the week before the latest issue.
 *
 * Example:
 *   - Monday-Saturday of Week 8 → returns Week 7
 *   - Sunday of Week 8 → returns Week 8 (shown once built, i.e. never before Monday)
 */
export function getCurrentDigestWeek(): string {
  const now = DateTime.now().setZone(TZ);
  return formatWeekLabel(now.weekday === 7 ? now : now.minus({ days: 7 }));
}

/**
 * Get the current INGESTION week label — the week the articles fetched "now"
 * are collected for (CET).
 *
 * Tuesday–Sunday: the week in progress. Monday: the previous week, because
 * Monday's fetches (the daily job and the weekly build's own RSS step) close
 * out the week that just ended, so discovery and source_yield.json line up with
 * the digest being built that morning.
 */
export function getCurrentIngestionWeek(): string {
  const now = DateTime.now().setZone(TZ);
  return formatWeekLabel(now.weekday === 1 ? now.minus({ days: 7 }) : now);
}

/**
 * Alias kept for backward compatibility.
 * Identical to getCurrentDigestWeek().
 */
export function getPreviousWeek(): string {
  return getCurrentDigestWeek();
}
