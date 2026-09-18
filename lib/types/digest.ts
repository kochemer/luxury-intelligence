/**
 * Canonical WeeklyDigest and related type definitions.
 * 
 * This is the single source of truth for digest types across the codebase.
 * These types match the JSON structure written to data/digests/{week}.json.
 * 
 * IMPORTANT: Do not change field names without also updating existing digest JSON files.
 */

import type { Article, ArticleWithRelevance } from './article';

/**
 * Topic keys used in the digest structure.
 * These MUST match the keys used in data/digests/*.json files.
 */
export type Topic = 
  | 'AI_and_Strategy'
  | 'Ecommerce_Retail_Tech'
  | 'Luxury_and_Consumer'
  | 'Jewellery_Industry';

/**
 * Topic keys used in the totals.byTopic structure.
 * These MUST match the keys used in data/digests/*.json files.
 */
export type TopicTotalsKey = 
  | 'AIStrategy'
  | 'EcommerceRetail'
  | 'LuxuryConsumer'
  | 'Jewellery';

/**
 * Mapping from Topic to TopicTotalsKey for programmatic access
 */
export const TOPIC_TO_TOTALS_KEY: Record<Topic, TopicTotalsKey> = {
  'AI_and_Strategy': 'AIStrategy',
  'Ecommerce_Retail_Tech': 'EcommerceRetail',
  'Luxury_and_Consumer': 'LuxuryConsumer',
  'Jewellery_Industry': 'Jewellery',
};

/**
 * Single topic section within a digest
 */
export interface DigestTopic<T extends Article = Article> {
  total: number;
  top: T[];
}

/**
 * Totals breakdown by topic
 */
export interface DigestTotals {
  total: number;
  byTopic: {
    AIStrategy: number;
    EcommerceRetail: number;
    LuxuryConsumer: number;
    Jewellery: number;
  };
}

/**
 * Topics container structure
 */
export interface DigestTopics<T extends Article = Article> {
  AI_and_Strategy: DigestTopic<T>;
  Ecommerce_Retail_Tech: DigestTopic<T>;
  Luxury_and_Consumer: DigestTopic<T>;
  Jewellery_Industry: DigestTopic<T>;
}

/**
 * Canonical WeeklyDigest type.
 * 
 * This matches the JSON structure in data/digests/{week}.json exactly.
 * The generic parameter allows using Article or ArticleWithRelevance
 * depending on the context.
 */
export interface WeeklyDigest<T extends Article = Article> {
  // === Week identification ===
  weekLabel: string; // e.g., "2026-W05"
  tz: string; // Timezone used for week calculation, e.g., "Europe/Copenhagen"
  startISO: string; // ISO timestamp of week start (Monday 00:00)
  endISO: string; // ISO timestamp of week end (Sunday 23:59:59)
  
  // === Build metadata ===
  builtAtISO?: string; // ISO timestamp when digest was built
  builtAtLocal?: string; // Human-readable local time when built
  contentUpdatedAtISO?: string; // Last time page-visible content was regenerated after the build (summaries, insight, themes) — drives sitemap lastmod
  
  // === Cover image ===
  coverImageUrl?: string; // URL to weekly cover image
  coverImageAlt?: string; // Alt text for cover image
  coverKeywords?: string[]; // Keywords used to generate cover
  
  // === Summary content ===
  keyThemes?: string[]; // Key themes for the week
  oneSentenceSummary?: string; // One-line summary of the week
  introParagraph?: string; // Longer intro paragraph
  weeklyInsight?: string; // Pull-quote / editorial insight shown between stats and category nav

  // === Editorial Take ===
  editorialTake?: string; // AI-generated first-person editorial opinion (~150-200 words)
  editorialTakeOverride?: boolean; // If true, pipeline will NOT overwrite editorialTake on rebuild
  
  // === Article counts ===
  totals: DigestTotals;
  
  // === Articles by topic ===
  topics: DigestTopics<T>;
}

/**
 * WeeklyDigest with ArticleWithRelevance (used during digest building)
 */
export type WeeklyDigestWithRelevance = WeeklyDigest<ArticleWithRelevance>;

// ============================================================================
// Email Digest Types (separate artifact: data/weeks/{week}/email-digest.json)
// ============================================================================

/**
 * Single item in the email digest (ranked article with bullets)
 */
export interface EmailDigestItem {
  rank: number;
  title: string;
  url: string;
  source: string;
  bullets: string[];
  summary?: string; // Article summary (aiSummary or snippet) for bullet extraction fallback
}

/**
 * Email digest structure (data/weeks/{week}/email-digest.json)
 */
export interface EmailDigest {
  week: string;
  generatedAt: string;
  intro?: string;
  readOneThing?: { title: string; url: string };
  items: EmailDigestItem[];
}
