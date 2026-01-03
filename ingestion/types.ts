export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
  snippet?: string;
  aiSummary?: string;
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
