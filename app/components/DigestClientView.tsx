'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import CategorySection from './CategorySection';
import { getTopicDisplayName, TopicKey } from '@/lib/utils/topicNames';
import { formatDate } from '@/lib/utils/formatDate';
import { getMessages } from '@/lib/i18n/messages';
import type { WeeklyDigest } from '@/lib/types';
import type { Locale } from '@/lib/i18n/types';

const VALID_N_VALUES = [3, 4, 5, 6, 7] as const;
const DEFAULT_N = 7;

type TopNValue = typeof VALID_N_VALUES[number];

function isValidN(value: number | null | undefined): value is TopNValue {
  return value !== null && value !== undefined && VALID_N_VALUES.includes(value as TopNValue);
}

function getNFromStorage(): TopNValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('topN');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (isValidN(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    // localStorage might not be available
  }
  return null;
}

type CategoryCard = {
  key: TopicKey;
  color: string;
  title: string;
  desc: string;
  countBy: string;
  topInfo: string;
  anchorId: string;
};

type DigestClientViewProps = {
  digest: WeeklyDigest;
  categoryCards?: CategoryCard[];
  variant?: 'home' | 'week';
  locale?: Locale;
  /** Homepage: show this many per category (ignores Top-N) */
  perCategory?: number;
  /** Issue page URL; with perCategory, each category links to its section there */
  moreHref?: string;
  /** Tighter vertical rhythm between categories (homepage) */
  compact?: boolean;
};

export default function DigestClientView({ 
  digest, 
  categoryCards,
  variant = 'home',
  locale = 'en',
  perCategory,
  moreHref,
  compact,
}: DigestClientViewProps) {
  const searchParams = useSearchParams();
  const t = getMessages(locale);
  
  // Get current N from URL param or default (server-safe)
  // Don't access localStorage during initial render to avoid hydration mismatch
  const topN = useMemo(() => {
    const urlN = searchParams.get('n');
    if (urlN) {
      const parsed = parseInt(urlN, 10);
      if (isValidN(parsed)) {
        return parsed;
      }
    }
    // Always return default on server - localStorage will be checked after hydration
    return DEFAULT_N;
  }, [searchParams]);
  
  // Use state to track the effective topN value
  // Initialize with server-safe value (URL param or default)
  const [effectiveTopN, setEffectiveTopN] = useState<TopNValue>(topN);
  
  // Update when topN changes (from URL params)
  useEffect(() => {
    if (topN !== effectiveTopN) {
      setEffectiveTopN(topN);
    }
  }, [topN]);
  
  // Sync with localStorage after hydration (only if no URL param)
  useEffect(() => {
    const urlN = searchParams.get('n');
    if (!urlN) {
      // No URL param - check localStorage (client-side only)
      const storedN = getNFromStorage();
      if (storedN && storedN !== topN) {
        setEffectiveTopN(storedN);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (variant === 'home') {
    // Home page: 12-column grid layout
    if (!categoryCards) {
      return null;
    }
    return (
      <section className="w-full mb-6 md:mb-16">
        <div className={`w-full grid grid-cols-12 gap-x-0 ${compact ? 'gap-y-0 lg:gap-x-10' : 'gap-y-8 lg:gap-10'}`}>
          {categoryCards.map(cat => {
            // @ts-ignore
            const topic = digest.topics[cat.key];
            // @ts-ignore
            const totalCat = digest.totals.byTopic[cat.countBy] ?? 0;
            
            // Slice articles client-side based on effectiveTopN
            const allArticles = topic?.top || [];
            const formattedArticles = allArticles.slice(0, perCategory ?? effectiveTopN).map((article: any) => ({
              ...article,
              date: formatDate(article.published_at),
            }));
            
            return (
              <div key={cat.key} className="col-span-12 lg:col-span-6 w-full">
                <CategorySection
                  id={cat.anchorId}
                  variant="grid"
                  title={cat.title}
                  description={cat.desc}
                  count={totalCat}
                  articles={formattedArticles}
                  locale={locale}
                  emptyTitle={t.digest.coverageLightTitle}
                  emptyDesc={t.digest.coverageLightDesc}
                  emptyCta={t.digest.suggestSource}
                  countLabel={t.digest.articlesCount}
                  aiSummaryLabel={t.digest.aiSummary}
                  categoryKey={cat.key}
                  moreHref={perCategory && moreHref && allArticles.length > formattedArticles.length ? `${moreHref}#${cat.anchorId}` : undefined}
                  moreLabel={`All ${allArticles.length} in ${cat.title}`}
                  selectedTotal={allArticles.length}
                  compact={compact}
                />
              </div>
            );
          })}
        </div>
      </section>
    );
  } else {
    // Week page: vertical list layout
    return (
      <div className="space-y-12 md:space-y-16">
        {/* AI & Strategy */}
        <CategorySection
          title={getTopicDisplayName('AI_and_Strategy')}
          count={digest.topics.AI_and_Strategy.total}
          articles={digest.topics.AI_and_Strategy.top.slice(0, effectiveTopN).map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
          locale={locale}
          emptyTitle={t.digest.coverageLightTitle}
          emptyDesc={t.digest.coverageLightDesc}
          emptyCta={t.digest.suggestSource}
          countLabel={t.digest.articlesCount}
          aiSummaryLabel={t.digest.aiSummary}
          categoryKey="AI_and_Strategy"
        />

        {/* Ecommerce & Retail Tech */}
        <CategorySection
          title={getTopicDisplayName('Ecommerce_Retail_Tech')}
          count={digest.topics.Ecommerce_Retail_Tech.total}
          articles={digest.topics.Ecommerce_Retail_Tech.top.slice(0, effectiveTopN).map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
          locale={locale}
          emptyTitle={t.digest.coverageLightTitle}
          emptyDesc={t.digest.coverageLightDesc}
          emptyCta={t.digest.suggestSource}
          countLabel={t.digest.articlesCount}
          aiSummaryLabel={t.digest.aiSummary}
          categoryKey="Ecommerce_Retail_Tech"
        />

        {/* Luxury & Consumer */}
        <CategorySection
          title={getTopicDisplayName('Luxury_and_Consumer')}
          count={digest.topics.Luxury_and_Consumer.total}
          articles={digest.topics.Luxury_and_Consumer.top.slice(0, effectiveTopN).map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
          locale={locale}
          emptyTitle={t.digest.coverageLightTitle}
          emptyDesc={t.digest.coverageLightDesc}
          emptyCta={t.digest.suggestSource}
          countLabel={t.digest.articlesCount}
          aiSummaryLabel={t.digest.aiSummary}
          categoryKey="Luxury_and_Consumer"
        />

        {/* Jewellery Industry */}
        <CategorySection
          title={getTopicDisplayName('Jewellery_Industry')}
          count={digest.topics.Jewellery_Industry.total}
          articles={digest.topics.Jewellery_Industry.top.slice(0, effectiveTopN).map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
          locale={locale}
          emptyTitle={t.digest.coverageLightTitle}
          emptyDesc={t.digest.coverageLightDesc}
          emptyCta={t.digest.suggestSource}
          countLabel={t.digest.articlesCount}
          aiSummaryLabel={t.digest.aiSummary}
          categoryKey="Jewellery_Industry"
        />
      </div>
    );
  }
}
