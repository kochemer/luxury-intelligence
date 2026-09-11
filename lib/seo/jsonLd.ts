/**
 * Structured data builders — one definition of every entity on the site.
 *
 * Before this existed, `Organization` and `Person` were declared independently
 * in app/layout.tsx and app/digest/[slug]/page.tsx, with no `@id` on either.
 * Search engines and AI answer engines therefore had no way to know the
 * publisher of an article was the same organisation that runs the website —
 * they were three unrelated, anonymous entities that happened to share a name.
 *
 * Everything here is anchored with `@id` so the graph resolves: the WebSite is
 * published by the Organization, an Article's publisher *is* that Organization,
 * and its author *is* the site's editor. Entity resolution is what lets an
 * answer engine attribute a claim to a named publisher, which is the
 * foundation of GEO/AEO — you cannot be cited as a source if the machine
 * cannot tell who you are.
 */

import type { WeeklyDigest, Article } from '@/lib/types';

/** Stable entity identifiers. Fragments, so they never collide with real URLs. */
export const entityId = {
  website: (siteUrl: string) => `${siteUrl}/#website`,
  organization: (siteUrl: string) => `${siteUrl}/#organization`,
  editor: (siteUrl: string) => `${siteUrl}/#editor`,
  webPage: (url: string) => `${url}#webpage`,
} as const;

export const PUBLICATION_NAME = 'Luxury Intelligence';
export const PUBLICATION_DESCRIPTION =
  'Luxury Ecommerce, Retail Technology & AI - Curated intelligence and AI-assisted summaries for luxury, ecommerce, and retail tech.';

/**
 * The publisher entity.
 *
 * `sameAs` is deliberately absent rather than guessed: it should list the
 * publication's real profiles (LinkedIn, X, Wikidata) and inventing URLs would
 * be worse than omitting the property. Add them here when they exist — it is
 * the strongest single signal for disambiguating an organisation entity.
 */
export function buildOrganizationLd(siteUrl: string) {
  return {
    '@type': 'Organization',
    '@id': entityId.organization(siteUrl),
    name: PUBLICATION_NAME,
    url: `${siteUrl}/`,
    description: PUBLICATION_DESCRIPTION,
    logo: {
      '@type': 'ImageObject',
      url: `${siteUrl}/favicon.png`,
      caption: PUBLICATION_NAME,
    },
  };
}

export function buildEditorLd(siteUrl: string) {
  return {
    '@type': 'Person',
    '@id': entityId.editor(siteUrl),
    name: 'The Editor',
    url: `${siteUrl}/about`,
    description: 'Curator of Luxury Intelligence.',
    worksFor: { '@id': entityId.organization(siteUrl) },
  };
}

/**
 * The root graph, emitted once site-wide from the layout.
 *
 * Uses `@graph` so the WebSite, Organization and Person are declared as one
 * connected set rather than three nested copies — which is what allows every
 * other page to reference them by `@id` instead of repeating them.
 */
export function buildRootGraphLd(siteUrl: string, locale = 'en') {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': entityId.website(siteUrl),
        name: PUBLICATION_NAME,
        url: `${siteUrl}/`,
        description: PUBLICATION_DESCRIPTION,
        inLanguage: locale,
        publisher: { '@id': entityId.organization(siteUrl) },
      },
      buildOrganizationLd(siteUrl),
      buildEditorLd(siteUrl),
    ],
  };
}

/** Every curated article across all four topics, in the order the page renders them. */
export function collectDigestArticles(digest: WeeklyDigest): Article[] {
  return [
    ...digest.topics.Ecommerce_Retail_Tech.top,
    ...digest.topics.Jewellery_Industry.top,
    ...digest.topics.AI_and_Strategy.top,
    ...digest.topics.Luxury_and_Consumer.top,
  ];
}

/**
 * NewsArticle for a weekly digest page.
 *
 * `NewsArticle` rather than the generic `Article`: this is a dated news
 * publication, and the more specific type is what makes a page eligible for
 * news treatment and clearer to answer engines.
 */
export function buildNewsArticleLd(args: {
  siteUrl: string;
  url: string;
  headline: string;
  description: string;
  digest: WeeklyDigest;
  imageUrl?: string;
  locale?: string;
}) {
  const { siteUrl, url, headline, description, digest, imageUrl, locale = 'en' } = args;

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    // schema.org caps headline at 110 characters; longer values are ignored.
    headline: headline.length > 110 ? `${headline.slice(0, 109)}…` : headline,
    description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': entityId.webPage(url) },
    isPartOf: { '@id': entityId.website(siteUrl) },
    publisher: { '@id': entityId.organization(siteUrl) },
    author: { '@id': entityId.editor(siteUrl) },
    inLanguage: locale,
    isAccessibleForFree: true,
    articleSection: [
      'Ecommerce & Retail Tech',
      'Jewellery Industry',
      'AI & Strategy',
      'Luxury & Consumer',
    ],
    ...(digest.startISO && { datePublished: digest.startISO }),
    ...(digest.builtAtISO && { dateModified: digest.builtAtISO }),
    ...(imageUrl && { image: [imageUrl] }),
    ...(digest.keyThemes?.length ? { keywords: digest.keyThemes.join(', ') } : {}),
  };
}

/**
 * The week's curated stories as an ordered list.
 *
 * This is the page's actual substance expressed as data. Without it, a machine
 * reading the digest sees prose and has to infer that it is a curated
 * selection of named sources; with it, the selection is explicit and citable.
 */
export function buildDigestItemListLd(args: {
  siteUrl: string;
  url: string;
  dateRange: string;
  digest: WeeklyDigest;
}) {
  const { url, dateRange, digest } = args;
  const articles = collectDigestArticles(digest);

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Curated stories · ${dateRange}`,
    description: `${articles.length} stories selected from ${digest.totals.total} analysed across AI, ecommerce, luxury and jewellery.`,
    numberOfItems: articles.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    mainEntityOfPage: { '@id': entityId.webPage(url) },
    itemListElement: articles.map((article, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: article.title,
      url: article.url,
      ...(article.source && {
        item: {
          '@type': 'NewsArticle',
          headline: article.title.length > 110 ? `${article.title.slice(0, 109)}…` : article.title,
          url: article.url,
          publisher: { '@type': 'Organization', name: article.source },
          ...(article.published_at && { datePublished: article.published_at }),
        },
      }),
    })),
  };
}

export function buildBreadcrumbLd(args: {
  siteUrl: string;
  items: { name: string; url?: string }[];
}) {
  const { items } = args;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      // The final crumb is the current page and carries no `item` by convention.
      ...(item.url && index < items.length - 1 ? { item: item.url } : {}),
    })),
  };
}

/** CollectionPage for an index of digests, e.g. /archive. */
export function buildArchiveCollectionLd(args: {
  siteUrl: string;
  url: string;
  name: string;
  description: string;
  entries: { url: string; name: string; datePublished?: string }[];
  locale?: string;
}) {
  const { siteUrl, url, name, description, entries, locale = 'en' } = args;

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': entityId.webPage(url),
    name,
    description,
    url,
    inLanguage: locale,
    isPartOf: { '@id': entityId.website(siteUrl) },
    publisher: { '@id': entityId.organization(siteUrl) },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: entries.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: entries.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: entry.name,
        url: entry.url,
      })),
    },
  };
}
