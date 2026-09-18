/**
 * Digest content-quality gate (BLOCKING, not a warning).
 *
 * Unlike the health checks in runChecks.ts — which only ever emit warnings —
 * this gate returns a pass/fail verdict that the pipeline treats as critical.
 * Its job is to catch the "hollow digest" failure mode where every
 * OpenAI-dependent step silently degraded (e.g. exhausted API credits →
 * 429s) yet the run still exited 0 and shipped a digest with no AI summaries
 * and no cover image.
 *
 * Note on `snippet` vs `aiSummary`: the structural validator in
 * runWeeklyPipeline.ts counts a raw RSS `snippet` as "has a summary", so a
 * digest with zero real AI summaries still passes it. This gate deliberately
 * looks only at `aiSummary` (the OpenAI-generated field) so that a total
 * summarization outage is caught.
 */

import type { WeeklyDigest, Topic } from '../../lib/types';

const TOPIC_KEYS: Topic[] = [
  'AI_and_Strategy',
  'Ecommerce_Retail_Tech',
  'Luxury_and_Consumer',
  'Jewellery_Industry',
];

export interface DigestContentQualityOptions {
  /** Minimum fraction (0–1) of selected top articles that must have a real aiSummary. */
  minSummaryCoverage?: number;
  /** Whether a cover image is required. */
  requireCover?: boolean;
  /**
   * Whether the weekly insight (`oneSentenceSummary`) and `keyThemes` are required.
   * These feed the homepage pull-quote, the digest-page meta description, JSON-LD
   * keywords and llms.txt — they were silently null for 34 weeks (W04–W37) because
   * the pipeline's build path never called the generator.
   */
  requireInsight?: boolean;
}

export interface DigestContentQualityResult {
  ok: boolean;
  errors: string[];
  /** Fraction of selected top articles that have a non-empty aiSummary. */
  summaryCoverage: number;
  selectedCount: number;
  summarizedCount: number;
  hasCover: boolean;
  /** Whether `oneSentenceSummary` is a non-empty string. */
  hasInsight: boolean;
  /** Number of non-empty `keyThemes` entries. */
  themeCount: number;
}

export function checkDigestContentQuality(
  digest: WeeklyDigest,
  options: DigestContentQualityOptions = {}
): DigestContentQualityResult {
  const minSummaryCoverage = options.minSummaryCoverage ?? 0.5;
  const requireCover = options.requireCover ?? true;
  const requireInsight = options.requireInsight ?? true;

  const selected = TOPIC_KEYS.flatMap(k => digest.topics?.[k]?.top ?? []);
  const selectedCount = selected.length;
  const summarizedCount = selected.filter(
    a => typeof a.aiSummary === 'string' && a.aiSummary.trim().length > 0
  ).length;
  const summaryCoverage = selectedCount === 0 ? 0 : summarizedCount / selectedCount;

  const hasCover =
    typeof digest.coverImageUrl === 'string' && digest.coverImageUrl.trim().length > 0;

  const hasInsight =
    typeof digest.oneSentenceSummary === 'string' && digest.oneSentenceSummary.trim().length > 0;
  const themeCount = Array.isArray(digest.keyThemes)
    ? digest.keyThemes.filter(t => typeof t === 'string' && t.trim().length > 0).length
    : 0;

  const errors: string[] = [];

  if (selectedCount === 0) {
    errors.push('No articles were selected for any category — digest is empty.');
  } else if (summaryCoverage < minSummaryCoverage) {
    errors.push(
      `AI summary coverage too low: ${summarizedCount}/${selectedCount} ` +
        `(${(summaryCoverage * 100).toFixed(0)}%) selected articles have an aiSummary, ` +
        `minimum required is ${(minSummaryCoverage * 100).toFixed(0)}%. ` +
        `This usually means the summarization step failed (e.g. OpenAI credits/rate limit).`
    );
  }

  if (requireCover && !hasCover) {
    errors.push(
      'Missing cover image (coverImageUrl is not set). ' +
        'This usually means cover generation failed (e.g. OpenAI credits/rate limit).'
    );
  }

  if (requireInsight && !hasInsight) {
    errors.push(
      'Missing weekly insight (oneSentenceSummary is empty). ' +
        'This is the homepage pull-quote and the digest meta description; ' +
        'generateThemesForDigest did not run or failed.'
    );
  }

  if (requireInsight && themeCount === 0) {
    errors.push(
      'Missing key themes (keyThemes is empty). ' +
        'generateThemesForDigest did not run or failed.'
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    summaryCoverage,
    selectedCount,
    summarizedCount,
    hasCover,
    hasInsight,
    themeCount,
  };
}
