'use client';

import ArticleCard from './ArticleCard';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n/types';

type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at?: string;
  date?: string;
  aiSummary?: string | null;
  translations?: {
    da?: { title?: string; summary?: string };
    es?: { title?: string; summary?: string };
  };
};

type CategorySectionProps = {
  title: string;
  description?: string;
  count: number;
  articles: Article[];
  rankingLabel?: string;
  variant?: 'default' | 'grid';
  id?: string;
  locale?: Locale;
  emptyTitle?: string;
  emptyDesc?: string;
  emptyCta?: string;
  countLabel?: string;
  aiSummaryLabel?: string;
  categoryKey?: string;
  /** How many the issue selected, when fewer are shown here (homepage shows 3 of 7) */
  selectedTotal?: number;
  /** Link to the full list on the issue page */
  moreHref?: string;
  moreLabel?: string;
  /** Tighter spacing (homepage rows) */
  compact?: boolean;
};

export default function CategorySection({
  title,
  count,
  articles,
  variant = 'default',
  id,
  locale = 'en',
  emptyTitle = 'Coverage light this week',
  emptyDesc = 'This is a curated weekly selection. Not every category will have articles every week.',
  emptyCta = 'Suggest a source',
  aiSummaryLabel = 'AI summary',
  categoryKey,
  selectedTotal,
  moreHref,
  moreLabel,
  compact,
}: CategorySectionProps) {
  const isGrid = variant === 'grid';

  return (
    <section
      id={id}
      className={compact
        ? "scroll-mt-20 sm:scroll-mt-24 relative pb-8 md:pb-10 h-full flex flex-col"
        : isGrid
        ? "scroll-mt-20 sm:scroll-mt-24 relative pb-10 md:pb-20"
        : "mb-0 pb-10 md:pb-20 border-b border-[var(--color-border)] last:border-b-0 last:pb-0 last:mb-0 scroll-mt-20 sm:scroll-mt-24 relative pt-10 pb-10 md:pt-20 md:pb-20"
      }
    >
      {/* Editorial frontispiece header */}
      {/* Always visible: it used to start at opacity-0 and wait for an
          IntersectionObserver, so previews, print and fast scrollers saw blanks. */}
      <header className={`border-t border-[var(--color-accent)] ${compact ? 'mb-6 pt-8 md:pt-10' : 'mb-6 md:mb-10 pt-10 md:pt-16'}`}>
        {/* compact (homepage, two categories side by side): count under the title and a
            smaller title, so a wrapping title can't push one column lower than the other */}
        <div className={compact ? 'flex flex-col gap-1.5' : 'flex flex-col gap-1.5 md:flex-row md:items-end md:justify-between md:gap-4'}>
          <h2 className={`font-serif font-normal leading-tight tracking-[-0.02em] text-[var(--color-text-primary)] whitespace-nowrap overflow-hidden text-ellipsis ${compact ? 'text-[1.75rem] md:text-[2.25rem]' : 'text-[1.875rem] md:text-[2.75rem] md:leading-none'}`}>
            {title}
          </h2>
          {(count > 0 || articles.length > 0) && (
            <span className="font-sans text-[11px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] md:pb-1 shrink-0">
              {count} articles · {selectedTotal ?? articles.length} selected
            </span>
          )}
        </div>
        <hr className="mt-4 md:mt-5 border-[var(--color-border)]" />
      </header>

      {/* Articles List: first = Top Story card (full width), rest in 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {articles.length > 0 ? (
          <>
            <div className="md:col-span-2">
              <ArticleCard
                variant="featured"
                key={articles[0].id}
                title={articles[0].title}
                url={articles[0].url}
                source={articles[0].source}
                date={articles[0].date || articles[0].published_at || ''}
                summary={articles[0].aiSummary}
                locale={locale}
                translations={articles[0].translations}
                aiSummaryLabel={aiSummaryLabel}
                article_id={articles[0].id}
                article_rank={1}
                category={categoryKey}
              />
            </div>
            {articles.slice(1).map((article, index) => (
              <ArticleCard
                key={article.id}
                title={article.title}
                url={article.url}
                source={article.source}
                date={article.date || article.published_at || ''}
                summary={article.aiSummary}
                locale={locale}
                translations={article.translations}
                aiSummaryLabel={aiSummaryLabel}
                article_id={article.id}
                article_rank={index + 2}
                category={categoryKey}
              />
            ))}
          </>
        ) : (
          <div className="md:col-span-2 bg-[var(--color-surface)] rounded-lg border border-dashed border-[var(--color-border)] text-center py-6 sm:py-8 md:py-10 lg:py-12 px-3 sm:px-4 md:px-6">
            <div className="font-medium text-card-title text-[var(--color-text-secondary)] mb-1.5 sm:mb-2">
              {emptyTitle}
            </div>
            <div className="text-body text-[var(--color-text-secondary)] mb-3 sm:mb-4">
              {emptyDesc}
            </div>
            {isGrid && (
              <Link
                href="/feedback"
                className="text-meta text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline"
              >
                {emptyCta}
              </Link>
            )}
          </div>
        )}
      </div>
      {moreHref && (
        <Link
          href={moreHref}
          // mt-auto: the two categories in a row end at different heights; pinning the
          // link to the bottom keeps both "All 7" links on one line.
          className="mt-auto pt-6 self-start inline-flex items-center min-h-11 text-sm font-medium text-[var(--color-accent)] underline underline-offset-4 hover:opacity-80"
        >
          {moreLabel ?? 'See all'} <span aria-hidden="true">&nbsp;→</span>
        </Link>
      )}
    </section>
  );
}
