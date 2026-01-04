'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import CategorySection from './CategorySection';
import { getTopicDisplayName, TopicKey } from '../../utils/topicNames';
import { formatDate } from '../../utils/formatDate';

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

type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
  aiSummary?: string | null;
};

type WeeklyDigest = {
  weekLabel: string;
  tz: string;
  startISO: string;
  endISO: string;
  builtAtISO?: string;
  builtAtLocal?: string;
  totals: {
    total: number;
    byTopic: {
      AIStrategy: number;
      EcommerceRetail: number;
      LuxuryConsumer: number;
      Jewellery: number;
    };
  };
  topics: {
    AI_and_Strategy: { total: number; top: Article[] };
    Ecommerce_Retail_Tech: { total: number; top: Article[] };
    Luxury_and_Consumer: { total: number; top: Article[] };
    Jewellery_Industry: { total: number; top: Article[] };
  };
};

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
};

export default function DigestClientView({ 
  digest, 
  categoryCards,
  variant = 'home'
}: DigestClientViewProps) {
  const searchParams = useSearchParams();
  
  // Get current N from URL param, localStorage, or default
  const topN = useMemo(() => {
    const urlN = searchParams.get('n');
    if (urlN) {
      const parsed = parseInt(urlN, 10);
      if (isValidN(parsed)) {
        return parsed;
      }
    }
    const storedN = getNFromStorage();
    if (storedN) {
      return storedN;
    }
    return DEFAULT_N;
  }, [searchParams]);

  if (variant === 'home') {
    // Home page: 12-column grid layout
    if (!categoryCards) {
      return null;
    }
    return (
      <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-16 md:mb-20">
        <div className="w-full grid grid-cols-12 gap-8 lg:gap-10">
          {categoryCards.map(cat => {
            // @ts-ignore
            const topic = digest.topics[cat.key];
            // @ts-ignore
            const totalCat = digest.totals.byTopic[cat.countBy] ?? 0;
            
            // Slice articles client-side based on topN
            const formattedArticles = (topic?.top || []).slice(0, topN).map(article => ({
              ...article,
              date: formatDate(article.published_at),
            }));
            
            return (
              <div key={cat.key} className="col-span-12 lg:col-span-6 w-full">
                <CategorySection
                  id={cat.anchorId}
                  variant="grid"
                  title={getTopicDisplayName(cat.key)}
                  description={cat.desc}
                  count={totalCat}
                  articles={formattedArticles}
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
          articles={digest.topics.AI_and_Strategy.top.slice(0, topN).map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
        />

        {/* Ecommerce & Retail Tech */}
        <CategorySection
          title={getTopicDisplayName('Ecommerce_Retail_Tech')}
          count={digest.topics.Ecommerce_Retail_Tech.total}
          articles={digest.topics.Ecommerce_Retail_Tech.top.slice(0, topN).map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
        />

        {/* Luxury & Consumer */}
        <CategorySection
          title={getTopicDisplayName('Luxury_and_Consumer')}
          count={digest.topics.Luxury_and_Consumer.total}
          articles={digest.topics.Luxury_and_Consumer.top.slice(0, topN).map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
        />

        {/* Jewellery Industry */}
        <CategorySection
          title={getTopicDisplayName('Jewellery_Industry')}
          count={digest.topics.Jewellery_Industry.total}
          articles={digest.topics.Jewellery_Industry.top.slice(0, topN).map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
        />
      </div>
    );
  }
}

