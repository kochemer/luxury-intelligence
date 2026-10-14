/**
 * The stories the weekly podcast covers, in the order it covers them.
 *
 * Shared by the script writer (podcast/buildWeeklyPodcast.ts) and the RSS
 * feed's show notes (app/podcast/feed.xml/route.ts), so the notes list exactly
 * what the episode says. Keep this file free of heavy imports: the feed route
 * imports it, and anything it pulls in ships in that serverless function.
 */

import type { WeeklyDigest } from '../lib/types/digest';
import type { Article } from '../lib/types/article';

export function selectPodcastArticles(digest: WeeklyDigest): Article[] {
  return [
    ...digest.topics.Ecommerce_Retail_Tech.top.slice(0, 3),
    ...digest.topics.Jewellery_Industry.top.slice(0, 2),
    ...digest.topics.Luxury_and_Consumer.top.slice(0, 2),
    ...digest.topics.AI_and_Strategy.top.slice(0, 1),
  ];
}
