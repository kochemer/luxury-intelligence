/**
 * Single source of truth for topic display names.
 * Maps topic keys (used in digest structure) to their display labels.
 * 
 * Category IDs (TopicKey) are stable and never change.
 * Display names can be updated for UI purposes.
 * 
 * Backward compatibility: Old display names are mapped to new ones via aliases.
 */

export type TopicKey = 
  | 'AI_and_Strategy'
  | 'Ecommerce_Retail_Tech'
  | 'Luxury_and_Consumer'
  | 'Jewellery_Industry';

export type TopicTotalsKey = 
  | 'AIStrategy'
  | 'EcommerceRetail'
  | 'LuxuryConsumer'
  | 'Jewellery';

/**
 * Current display names (updated 2026-01)
 * - AI_and_Strategy -> "Artificial Intelligence News"
 * - Luxury_and_Consumer -> "Fashion & Luxury"
 */
export const TOPIC_DISPLAY_NAMES: Record<TopicKey, string> = {
  AI_and_Strategy: 'Artificial Intelligence News',
  Ecommerce_Retail_Tech: 'Ecommerce & Retail Tech',
  Luxury_and_Consumer: 'Fashion & Luxury',
  Jewellery_Industry: 'Jewellery Industry',
};

/**
 * Mapping from totals keys (used in digest.totals.byTopic) to display names
 */
export const TOPIC_TOTALS_DISPLAY_NAMES: Record<TopicTotalsKey, string> = {
  AIStrategy: 'Artificial Intelligence News',
  EcommerceRetail: 'Ecommerce & Retail Tech',
  LuxuryConsumer: 'Fashion & Luxury',
  Jewellery: 'Jewellery Industry',
};

/**
 * Backward compatibility: Map old display names to new ones
 * Used when loading historical week data that may have old category names
 */
export const CATEGORY_NAME_ALIASES: Record<string, TopicKey> = {
  // Old names -> New IDs
  'AI & Strategy': 'AI_and_Strategy',
  'Luxury & Consumer': 'Luxury_and_Consumer',
  'Ecommerce & Retail Tech': 'Ecommerce_Retail_Tech',
  'Jewellery Industry': 'Jewellery_Industry',
  // New names also map to IDs (for consistency)
  'Artificial Intelligence News': 'AI_and_Strategy',
  'Fashion & Luxury': 'Luxury_and_Consumer',
};

/**
 * Get display name for a topic key
 */
export function getTopicDisplayName(key: TopicKey): string {
  return TOPIC_DISPLAY_NAMES[key];
}

/**
 * Get display name for a totals key
 */
export function getTopicTotalsDisplayName(key: TopicTotalsKey): string {
  return TOPIC_TOTALS_DISPLAY_NAMES[key];
}

/**
 * Normalize a category name (old or new) to a TopicKey
 * Used for backward compatibility when loading historical data
 */
export function normalizeCategoryName(name: string): TopicKey | null {
  // Direct match
  if (name in TOPIC_DISPLAY_NAMES) {
    return name as TopicKey;
  }
  // Check aliases
  if (name in CATEGORY_NAME_ALIASES) {
    return CATEGORY_NAME_ALIASES[name];
  }
  return null;
}


