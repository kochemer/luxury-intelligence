/**
 * Ingestion-specific types.
 * 
 * Note: Article type is now in @/lib/types/article.ts
 * This file only contains source configuration types.
 */

// Re-export Article from canonical location for backward compatibility
export type { Article } from '../lib/types';

export type SourceFeed = {
  name: string;
  url: string;
  tier?: 1 | 2 | 3 | 4 | 5 | 6; // Source tier classification
  sourceType?: 'news' | 'retail' | 'academic' | 'specialist' | 'consultancy' | 'platform' | 'fashion_luxury' | 'jewellery' | 'blog'; // Source type for categorization
  categoryHint?: 'Fashion & Luxury' | 'Jewellery Industry'; // Optional hint for classification (non-binding)
  // Max feed pages to read via WordPress `?paged=N` (default 1). Stops early once
  // a page reaches items older than 8 days, so it only backfills the current week.
  paginate?: number;
};

export type SourcePage = {
  name: string;
  url: string;
  selectors: {
    item: string;
    title?: string;
    link: string;
    date?: string;
  };
  linkAttr?: string;
  dateFormatHint?: string;
  fallbackSelectors?: {
    item: string;
    title?: string;
    link: string;
    date?: string;
  };
  sourceType?: 'consultancy' | 'news' | 'blog' | 'fashion_luxury' | 'jewellery' | 'retail'; // Optional: categorize source type for future weighting
  categoryHint?: 'Fashion & Luxury' | 'Jewellery Industry'; // Optional hint for classification (non-binding)
};
