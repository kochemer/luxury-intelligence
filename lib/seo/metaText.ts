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

/**
 * The <title> for a digest page — complete, with no template suffix appended.
 *
 * The previous form was `"<range> Intelligence Digest – AI, Ecommerce & Luxury"`
 * which the root layout's `%s | Luxury Intelligence` template then extended to
 * 83–91 characters. Google truncates around 60, so every digest title was cut
 * mid-phrase, and "Luxury" appeared twice.
 *
 * This version is emitted with `title.absolute` so the template does not apply,
 * which buys back the 22 characters the suffix consumed. The date range leads
 * because it is what distinguishes one issue from another, and "Luxury
 * Intelligence" closes it — serving as both the brand and a keyword rather
 * than being duplicated. Worst case is a 20-character range, giving 58.
 */
export function buildWeekTitle(dateRange: string): string {
  return `${dateRange} · AI, Ecommerce & Luxury Intelligence`;
}

/**
 * What the browser and search results actually display for a digest page.
 *
 * Digest titles are absolute, so this is the title itself. Kept as a named
 * function so the auditor checks the real rendered string rather than
 * re-deriving the template rule and drifting from it.
 */
export function renderedWeekTitle(dateRange: string): string {
  return buildWeekTitle(dateRange);
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
