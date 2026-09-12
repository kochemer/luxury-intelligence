'use client';

import { formatDisplayDate } from '@/lib/utils/formatDisplayDate';
import { track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n/types';

type ArticleCardProps = {
  title: string;
  url: string;
  source?: string;
  date?: string;
  summary?: string | null;
  badges?: string[];
  locale?: Locale;
  translations?: {
    da?: { title?: string; summary?: string };
    es?: { title?: string; summary?: string };
  };
  aiSummaryLabel?: string;
  /** Analytics: optional for article_click */
  article_id?: string;
  article_rank?: number;
  category?: string;
  /** 'featured' = top story card with distinct layout; 'intelligence' = dense two-col editorial row */
  variant?: 'default' | 'featured' | 'intelligence';
};

export default function ArticleCard({
  title,
  url,
  source,
  date,
  summary,
  badges,
  locale = 'en',
  translations,
  aiSummaryLabel = 'AI summary',
  article_id,
  article_rank,
  category,
  variant = 'default',
}: ArticleCardProps) {
  let hostname: string | undefined;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = undefined;
  }

  const handleOutboundClick = () => {
    if (article_id != null || article_rank != null || category != null) {
      let source_domain: string | undefined;
      source_domain = hostname;
      track('article_click', {
        article_id,
        article_rank,
        category,
        source_domain,
      });
    }
  };

  // Resolve localized title and summary (fallback to English)
  const localizedTitle = (locale !== 'en' && translations?.[locale]?.title) || title;
  const localizedSummary = (locale !== 'en' && translations?.[locale]?.summary) || summary;

  // Clean summary text (remove AI-Generated Summary prefix if present)
  const cleanSummary = localizedSummary
    ?.replace(/^AI-Generated Summary:\s*/i, '')
    .replace(/^AI-generated summary:\s*/i, '')
    .trim() || null;

  // Format date for display
  const displayDate = date ? formatDisplayDate(date) : null;

  const linkProps = {
    href: url,
    target: '_blank',
    rel: 'noopener noreferrer' as const,
    onClick: handleOutboundClick,
  };

  if (variant === 'featured') {
    return (
      <article className="bg-[var(--color-accent-light)] border-l-4 border-[var(--color-accent)] p-5 md:p-8 rounded-sm mb-8">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)] font-sans font-bold mb-3">TOP STORY</div>
        <a
          {...linkProps}
          className="block no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 rounded-sm"
        >
          <h3 className="font-serif text-section font-bold text-[var(--color-text-primary)] pr-1 hover:text-[var(--color-accent)] transition-colors">
            {localizedTitle}
          </h3>
        </a>
        {cleanSummary && <p className="text-body text-[var(--color-text-secondary)] mt-3 max-w-3xl">{cleanSummary}</p>}
        <div className="text-[13px] text-[var(--color-text-secondary)] font-sans flex items-center gap-1.5 mt-4">
          {source && hostname && (
            <img
              // Third-party source favicons: a page can carry ~90 of these, so
              // eager loading meant ~90 round-trips to google.com before the
              // page settled. Deliberately a plain <img> rather than next/image
              // — they are 32px and cross-origin, so optimisation would cost
              // more than it saves. Empty alt: decorative, the source is named
              // in adjacent text.
              loading="lazy"
              decoding="async"
              src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
              alt=""
              className="w-4 h-4 rounded-sm inline-block opacity-60"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          {source && <span className="uppercase tracking-widest">{source}</span>}
          {source && displayDate && <span aria-hidden>·</span>}
          {displayDate && <span>{displayDate}</span>}
        </div>
        <a
          {...linkProps}
          className="text-body text-[var(--color-accent)] font-medium mt-4 inline-block hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 rounded"
        >
          Read article →
        </a>
      </article>
    );
  }

  if (variant === 'intelligence') {
    return (
      <article className="intel-article-row group flex items-baseline gap-3 py-2.5 border-b border-[var(--color-border)] last:border-b-0">
        {/* Source + date — fixed-width left gutter */}
        <div className="shrink-0 hidden sm:flex items-center gap-1.5 w-36">
          {source && (
            <span className="font-ibm-mono text-[10px] tracking-[0.06em] uppercase text-[var(--color-text-secondary)] opacity-60 truncate">
              {source}
            </span>
          )}
          {displayDate && (
            <span className="font-ibm-mono text-[10px] text-[var(--color-text-secondary)] opacity-40 shrink-0">
              {displayDate}
            </span>
          )}
        </div>

        {/* Title — fills remaining space, single line */}
        <a
          {...linkProps}
          className="flex-1 min-w-0 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 rounded-sm"
        >
          <span className="text-[0.875rem] font-sans text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors duration-150 line-clamp-1 leading-snug">
            {localizedTitle}
          </span>
        </a>

        {/* Badges — right-aligned, max 2 shown */}
        {badges && badges.length > 0 && (
          <div className="shrink-0 flex gap-1 items-center">
            {badges.slice(0, 2).map((badge, idx) => (
              <span
                key={idx}
                className="font-ibm-mono text-[9px] tracking-[0.05em] uppercase px-1.5 py-0.5 border border-[var(--color-border)] text-[var(--color-text-secondary)] opacity-70 rounded-sm whitespace-nowrap"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </article>
    );
  }

  return (
    <article
      className="group transition-all duration-200 py-6 border-b border-[var(--color-border)] pl-0 hover:pl-3 hover:border-l-2 hover:border-l-[var(--color-accent)] hover:bg-[var(--color-accent-light)] last:border-b-0"
    >
      {/* Source + date — single metadata line with favicon */}
      {(source || displayDate) && (
        <div className="text-[13px] text-[var(--color-text-secondary)] font-sans flex items-center gap-1.5 mb-1.5">
          {source && hostname && (
            <img
              // Third-party source favicons: a page can carry ~90 of these, so
              // eager loading meant ~90 round-trips to google.com before the
              // page settled. Deliberately a plain <img> rather than next/image
              // — they are 32px and cross-origin, so optimisation would cost
              // more than it saves. Empty alt: decorative, the source is named
              // in adjacent text.
              loading="lazy"
              decoding="async"
              src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
              alt=""
              className="w-4 h-4 rounded-sm inline-block opacity-60"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          {source && <span className="uppercase tracking-widest">{source}</span>}
          {source && displayDate && <span aria-hidden>·</span>}
          {displayDate && <span>{displayDate}</span>}
        </div>
      )}

      {/* Title - serif, card title */}
      <a
        {...linkProps}
        className="block no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 rounded-sm"
      >
        <h3 className="font-serif text-card-title font-semibold text-[var(--color-text-primary)] mb-2 line-clamp-3 pr-1 hover:text-[var(--color-accent)] transition-colors">
          {localizedTitle}
        </h3>
      </a>

      {/* Summary */}
      {cleanSummary && (
        <div className="mb-3">
          <span className="text-[10px] tracking-widest uppercase text-[var(--color-text-secondary)] mb-1 block">{aiSummaryLabel}</span>
          <p className="text-body text-[var(--color-text-secondary)] line-clamp-3">
            {cleanSummary}
          </p>
        </div>
      )}

      {/* Badges */}
      {badges && badges.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {badges.map((badge, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded text-meta border border-[var(--color-border)]"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Read article → link — always visible on touch devices, hover-only on desktop */}
      <div className="max-md:max-h-[2.5rem] md:max-h-0 md:group-hover:max-h-[2.5rem] group-focus-within:max-h-[2.5rem] overflow-hidden transition-[max-height] duration-200 flex justify-end">
        <a
          {...linkProps}
          className="text-body text-[var(--color-accent)] font-medium max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 hover:underline focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 rounded px-1 -mr-1 py-1"
        >
          Read article →
        </a>
      </div>
    </article>
  );
}
