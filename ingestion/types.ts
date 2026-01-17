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
  sourceType?: 'rss' | 'page' | 'discovery'; // How article was ingested
};

export type SourceFeed = {
  name: string;
  url: string;
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
};
