/**
 * Single source of truth for topic display names.
 * Maps topic keys (used in digest structure) to their display labels.
 */

export type TopicKey = 
  | 'JewelleryIndustry'
  | 'EcommerceTechnology'
  | 'AIEcommerceStrategy'
  | 'LuxuryConsumerBehaviour';

export type TopicTotalsKey = 
  | 'Jewellery'
  | 'Ecommerce'
  | 'AIStrategy'
  | 'Luxury';

/**
 * Mapping from topic keys (used in digest.topics) to display names
 */
export const TOPIC_DISPLAY_NAMES: Record<TopicKey, string> = {
  JewelleryIndustry: 'Jewellery Industry',
  EcommerceTechnology: 'Ecommerce Technology',
  AIEcommerceStrategy: 'AI & Ecommerce Strategy',
  LuxuryConsumerBehaviour: 'Luxury Consumer Behaviour',
};

/**
 * Mapping from totals keys (used in digest.totals.byTopic) to display names
 */
export const TOPIC_TOTALS_DISPLAY_NAMES: Record<TopicTotalsKey, string> = {
  Jewellery: 'Jewellery Industry',
  Ecommerce: 'Ecommerce Technology',
  AIStrategy: 'AI & Ecommerce Strategy',
  Luxury: 'Luxury Consumer Behaviour',
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


