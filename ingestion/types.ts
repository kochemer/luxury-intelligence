export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
  snippet?: string;
  aiSummary?: string;
  // Discovery-specific fields
  discoveredAt?: string; // ISO timestamp when article was discovered/extracted
  publishedDateInvalid?: boolean; // True if published_at is invalid/missing
  usedDiscoveredAtFallback?: boolean; // True if included via discoveredAt fallback
  sourceType?: 'rss' | 'page' | 'discovery' | 'consultancy' | 'platform'; // How article was ingested
  categoryHint?: 'Fashion & Luxury' | 'Jewellery Industry'; // Optional hint from RSS source (non-binding)
};

export type SourceFeed = {
  name: string;
  url: string;
  tier?: 1 | 2 | 3 | 4 | 5 | 6; // Source tier classification
  sourceType?: 'news' | 'retail' | 'academic' | 'specialist' | 'consultancy' | 'platform' | 'fashion_luxury' | 'jewellery'; // Source type for categorization
  categoryHint?: 'Fashion & Luxury' | 'Jewellery Industry'; // Optional hint for classification (non-binding)
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
  sourceType?: 'consultancy' | 'news' | 'blog'; // Optional: categorize source type for future weighting
};
