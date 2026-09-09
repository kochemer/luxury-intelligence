/**
 * Title/description builders for digest pages.
 *
 * Extracted from app/digest/[slug]/page.tsx so the live page and the SEO
 * auditor evaluate the exact same logic — no risk of the two drifting apart.
 */

import { getSelectedArticleCount } from '@/lib/utils/digestStats';
import type { WeeklyDigest } from '@/lib/types';

export const DIGEST_TITLE_SUFFIX = ' | Luxury Intelligence';

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/** The <title> shown for a digest page, before the site-wide " | Luxury Intelligence" suffix. */
export function buildWeekTitle(dateRange: string): string {
  return `${dateRange} Intelligence Digest – AI, Ecommerce & Luxury`;
}

/** The meta description shown for a digest page. */
export function buildWeekMetaDescription(digest: WeeklyDigest, dateRange: string): string {
  const total = digest.totals.total;
  const selected = getSelectedArticleCount(digest);

  if (digest.oneSentenceSummary) {
    const insight = truncate(digest.oneSentenceSummary, 155);
    const withCount = `${insight} (${total} articles · ${selected} curated)`;
    return withCount.length <= 155 ? withCount : insight;
  }

  const topTitle =
    digest.topics.AI_and_Strategy.top[0]?.title ??
    digest.topics.Ecommerce_Retail_Tech.top[0]?.title ??
    digest.topics.Luxury_and_Consumer.top[0]?.title ??
    null;

  const base = `${total} articles analysed across AI, ecommerce, luxury & jewellery · ${dateRange}.`;
  if (topTitle) return truncate(`${base} Top story: ${topTitle}`, 155);
  return base;
}
