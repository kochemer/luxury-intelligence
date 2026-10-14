/**
 * Which digest stories each post may use. Deterministic, so a re-run of the
 * same week picks the same stories and the fact check knows exactly which
 * text the post was allowed to draw on.
 *
 * - Lead stories: the #1 story of each category. The Monday LinkedIn post and
 *   X thread use three of them (the model picks the three that fit the week's
 *   point best).
 * - Story of the day, Tue–Fri: the #2 story of one category per day, so the
 *   week's X posts never repeat Monday's stories.
 */

import type { Article } from '../lib/types/article';
import type { Topic, WeeklyDigest } from '../lib/types/digest';
import type { Weekday } from './types';

export const TOPIC_LABEL: Record<Topic, string> = {
  Luxury_and_Consumer: 'Luxury',
  Ecommerce_Retail_Tech: 'Ecommerce & retail tech',
  Jewellery_Industry: 'Jewellery',
  AI_and_Strategy: 'AI & strategy',
};

const TOPIC_ORDER: Topic[] = ['Luxury_and_Consumer', 'Ecommerce_Retail_Tech', 'Jewellery_Industry', 'AI_and_Strategy'];

export const STORY_OF_DAY_TOPIC: Record<Exclude<Weekday, 'mon'>, Topic> = {
  tue: 'Luxury_and_Consumer',
  wed: 'Ecommerce_Retail_Tech',
  thu: 'Jewellery_Industry',
  fri: 'AI_and_Strategy',
};

export interface PickedStory {
  topic: Topic;
  article: Article;
}

export function leadStories(digest: WeeklyDigest): PickedStory[] {
  return TOPIC_ORDER.flatMap((topic) => {
    const article = digest.topics[topic]?.top?.[0];
    return article ? [{ topic, article }] : [];
  });
}

export function storyOfTheDay(digest: WeeklyDigest, day: Exclude<Weekday, 'mon'>): PickedStory | null {
  const topic = STORY_OF_DAY_TOPIC[day];
  const article = digest.topics[topic]?.top?.[1];
  return article ? { topic, article } : null;
}

/** Plain-text description of a story for a prompt. Summary first: it is checked text. */
export function describeStory(s: PickedStory): string {
  const a = s.article;
  return [
    `id: ${a.id}`,
    `category: ${TOPIC_LABEL[s.topic]}`,
    `title: ${a.title}`,
    `source: ${cleanSource(a.source)}`,
    `summary: ${a.aiSummary || a.snippet || ''}`,
  ].join('\n');
}

/** "Business of Fashion (via Bing News)" → "Business of Fashion". */
export function cleanSource(source: string): string {
  return source.replace(/\s*\(via [^)]*\)\s*$/i, '').trim();
}
