/**
 * Which digest articles the cover Scene Director may build its joke from.
 *
 * Since v9 (2026-10-12): Luxury top 2, Jewellery top 1, Ecommerce top 1, each
 * tagged with its topic. The Scene Director picks the one story that makes the
 * best on-brand joke. Before v9 this was Ecommerce top 2 + Jewellery top 1 with
 * Ecommerce #1 forced as the lead, which produced 2026-W41's delivery-van cover
 * off an Indian festive-sales story. Shared by the pipeline, scripts/regenerateCover.ts
 * and scripts/mockCover.ts so the three can't drift apart again.
 */

import type { WeeklyDigest, DigestTopics } from '../lib/types';
import type { ArticleInput } from './sceneDirector';

const COVER_TOPICS: Array<{ key: keyof DigestTopics; label: string; take: number }> = [
  { key: 'Luxury_and_Consumer', label: 'Luxury & Consumer', take: 2 },
  { key: 'Jewellery_Industry', label: 'Jewellery Industry', take: 1 },
  { key: 'Ecommerce_Retail_Tech', label: 'Ecommerce & Retail Tech', take: 1 },
];

export function selectCoverArticles(digest: WeeklyDigest): ArticleInput[] {
  const out: ArticleInput[] = [];
  for (const { key, label, take } of COVER_TOPICS) {
    const top = digest.topics?.[key]?.top ?? [];
    for (const a of top.slice(0, take)) {
      out.push({
        title: a.title,
        topic: label,
        source: a.source,
        snippet: a.snippet,
        aiSummary: a.aiSummary,
        rerankWhy: a.rerankWhy,
      });
    }
  }
  return out;
}
