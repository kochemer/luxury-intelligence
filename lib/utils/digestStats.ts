/**
 * Helpers for digest stats used in StatsBar and secondary copy.
 */

import type { WeeklyDigest } from '@/lib/types';

/** Number of articles published in the digest (sum of topic top arrays). */
export function getSelectedArticleCount(digest: WeeklyDigest): number {
  return (
    digest.topics.AI_and_Strategy.top.length +
    digest.topics.Ecommerce_Retail_Tech.top.length +
    digest.topics.Luxury_and_Consumer.top.length +
    digest.topics.Jewellery_Industry.top.length
  );
}

/**
 * Format the stats bar secondary line:
 * "2,216 articles analysed · 1,434 on-topic · 28 selected · 16 min podcast"
 * "On-topic" is the sum of the per-category counts shown on the category
 * cards, so the numbers on the page reconcile (the total also counts articles
 * that matched no category). The podcast part is omitted when its length is unknown.
 */
export function formatStatsSecondaryLine(digest: WeeklyDigest, podcastMinutes?: number): string {
  const fmt = (n: number) => n.toLocaleString('en-US');
  const onTopic = Object.values(digest.totals.byTopic ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
  const parts = [`${fmt(digest.totals.total)} articles analysed`];
  if (onTopic > 0 && onTopic < digest.totals.total) parts.push(`${fmt(onTopic)} on-topic`);
  parts.push(`${getSelectedArticleCount(digest)} selected`);
  if (podcastMinutes != null) parts.push(`${Math.round(podcastMinutes)} min podcast`);
  return parts.join(' · ');
}

/**
 * Podcast player title with the real episode length ("… · 16 min").
 * Never hard-code a length: episodes run 12–16+ min and the copy drifted.
 */
export function podcastTitle(base: string, durationSeconds?: number): string {
  return durationSeconds && durationSeconds > 0 ? `${base} · ${Math.round(durationSeconds / 60)} min` : base;
}
