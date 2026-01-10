import { Suspense } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import type { Metadata } from 'next';
import DigestClientView from '../../components/DigestClientView';
import TopNSelector from '../../components/TopNSelector';
import JsonLd from '../../components/JsonLd';
import Breadcrumbs from '../../components/Breadcrumbs';
import { getTopicTotalsDisplayName, TopicKey } from '../../../utils/topicNames';
import { formatDate, formatDateRange, formatDateTime } from '../../../utils/formatDate';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app";

export async function generateMetadata({ params }: { params: Promise<{ weekLabel: string }> }): Promise<Metadata> {
  const { weekLabel } = await params;
  
  // Load digest to get cover image if available
  const digest = await loadDigest(weekLabel);
  const ogImage = digest?.coverImageUrl 
    ? `${siteUrl}${digest.coverImageUrl}`
    : `${siteUrl}/og-default.svg`;
  
  return {
    title: `Week ${weekLabel} – AI, Ecommerce & Luxury Industry Digest`,
    description: `Curated overview of the most relevant AI, ecommerce, luxury and jewellery industry news for week ${weekLabel}. Handpicked articles with AI summaries.`,
    alternates: {
      canonical: `/week/${weekLabel}`,
    },
    openGraph: {
      title: `Week ${weekLabel} – AI, Ecommerce & Luxury Industry Digest`,
      description: `Curated overview of the most relevant AI, ecommerce, luxury and jewellery industry news for week ${weekLabel}. Handpicked articles with AI summaries.`,
      images: [ogImage],
    },
    twitter: {
      title: `Week ${weekLabel} – AI, Ecommerce & Luxury Industry Digest`,
      description: `Curated overview of the most relevant AI, ecommerce, luxury and jewellery industry news for week ${weekLabel}. Handpicked articles with AI summaries.`,
      images: [ogImage],
    },
  };
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
  coverImageUrl?: string;
  coverImageAlt?: string;
  coverKeywords?: string[];
  keyThemes?: string[];
  oneSentenceSummary?: string;
  introParagraph?: string;
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


async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch {
    return null;
  }
}

/**
 * Get all available week labels from digest files
 * Returns sorted array of week labels (YYYY-W## format only)
 */
async function getAvailableWeeks(): Promise<string[]> {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files = await fs.readdir(digestsDir);
    
    // Filter for week format (YYYY-W##) and extract week labels
    // Pattern matches: 2025-W52.json, 2026-W01.json, etc.
    const weekLabels = files
      .filter(file => {
        // Match YYYY-W##.json where ## is 1-2 digits
        const matches = /^(\d{4})-W(\d{1,2})\.json$/.test(file);
        return matches;
      })
      .map(file => file.replace('.json', ''))
      .sort((a, b) => {
        // Sort chronologically: compare year first, then week number
        const [yearA, weekA] = a.split('-W').map(Number);
        const [yearB, weekB] = b.split('-W').map(Number);
        
        if (yearA !== yearB) {
          return yearA - yearB;
        }
        return weekA - weekB;
      });
    
    return weekLabels;
  } catch (err) {
    console.error('[Week Navigation] Error getting available weeks:', err);
    return [];
  }
}

/**
 * Find previous and next week labels for a given week
 */
async function getWeekNavigation(weekLabel: string): Promise<{
  previousWeek: string | null;
  nextWeek: string | null;
}> {
  try {
    const availableWeeks = await getAvailableWeeks();
    const currentIndex = availableWeeks.indexOf(weekLabel);
    
    if (currentIndex === -1) {
      // Week not found in available weeks
      return { previousWeek: null, nextWeek: null };
    }
    
    return {
      previousWeek: currentIndex > 0 ? availableWeeks[currentIndex - 1] : null,
      nextWeek: currentIndex < availableWeeks.length - 1 ? availableWeeks[currentIndex + 1] : null,
    };
  } catch (err) {
    console.error('[Week Navigation] Error getting week navigation:', err);
    return { previousWeek: null, nextWeek: null };
  }
}

export default async function WeekPage({ 
  params
}: { 
  params: Promise<{ weekLabel: string }>;
}) {
  const { weekLabel } = await params;
  
  // Validate format
  if (!/^\d{4}-W\d{1,2}$/.test(weekLabel)) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">Invalid Week Format</h1>
        <p className="text-base md:text-lg text-gray-600 mb-8 leading-relaxed">
          The week label "{weekLabel}" is not valid. Expected format: YYYY-W## (e.g., 2025-W52).
        </p>
        <div className="flex gap-4">
          <Link href="/archive" className="text-blue-600 hover:text-blue-800 underline">
            ← Archive
          </Link>
          <Link href="/" className="text-blue-600 hover:text-blue-800 underline">
            Home
          </Link>
        </div>
      </div>
    );
  }

  const digest = await loadDigest(weekLabel);
  const { previousWeek, nextWeek } = await getWeekNavigation(weekLabel);

  if (!digest) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">Digest Not Found</h1>
        <p className="text-base md:text-lg text-gray-600 mb-4 leading-relaxed">
          The digest for {weekLabel} has not been built yet.
        </p>
        <p className="text-sm md:text-base text-gray-600 mb-8 leading-relaxed">
          Run: <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">npx tsx scripts/buildWeeklyDigest.ts --week={weekLabel}</code>
        </p>
        <div className="flex gap-4">
          <Link href="/archive" className="text-blue-600 hover:text-blue-800 underline">
            ← Archive
          </Link>
          <Link href="/" className="text-blue-600 hover:text-blue-800 underline">
            Home
          </Link>
        </div>
      </div>
    );
  }

  const dateRange = formatDateRange(digest.startISO, digest.endISO);

  // Build CollectionPage JSON-LD schema
  const collectionPageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Week ${digest.weekLabel} – Weekly Digest`,
    url: `${siteUrl}/week/${digest.weekLabel}`,
    isPartOf: {
      "@type": "WebSite",
      name: "Luxury Intelligence",
      url: siteUrl,
    },
    about: [
      { "@type": "Thing", name: "AI & Strategy" },
      { "@type": "Thing", name: "Ecommerce & Retail Tech" },
      { "@type": "Thing", name: "Luxury & Consumer" },
      { "@type": "Thing", name: "Jewellery Industry" },
    ],
    ...(digest.startISO && { datePublished: digest.startISO }),
    ...(digest.builtAtISO && { dateModified: digest.builtAtISO }),
  };

  // Build BreadcrumbList JSON-LD schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Archive",
        item: `${siteUrl}/archive`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `Week ${digest.weekLabel}`,
        item: `${siteUrl}/week/${digest.weekLabel}`,
      },
    ],
  };

  // Category UI meta data (same as home page)
  const CATEGORY_CARDS: Array<{
    key: TopicKey;
    color: string;
    title: string;
    desc: string;
    countBy: string;
    topInfo: string;
    anchorId: string;
  }> = [
    {
      key: 'Ecommerce_Retail_Tech',
      color: '#264653',
      title: 'Ecommerce & Retail Tech',
      desc: 'Breakthroughs and trends shaping online commerce, retail, and emerging tech.',
      countBy: 'EcommerceRetail',
      topInfo: 'Top 7 articles by recency',
      anchorId: 'ecommerce-retail-tech',
    },
    {
      key: 'Jewellery_Industry',
      color: '#be8b36',
      title: 'Jewellery Industry',
      desc: 'Key updates and articles across jewellery brands, trade, and supply chain.',
      countBy: 'Jewellery',
      topInfo: 'Top 7 articles by recency',
      anchorId: 'jewellery-industry',
    },
    {
      key: 'AI_and_Strategy',
      color: '#25505f',
      title: 'AI & Strategy',
      desc: 'The latest advances and strategies in artificial intelligence and business transformation.',
      countBy: 'AIStrategy',
      topInfo: 'Top 7 articles by relevance',
      anchorId: 'ai-strategy',
    },
    {
      key: 'Luxury_and_Consumer',
      color: '#6b2d5c',
      title: 'Luxury & Consumer',
      desc: 'Innovations and changes in luxury and wider consumer products, experiences, and brands.',
      countBy: 'LuxuryConsumer',
      topInfo: 'Top 7 articles by recency',
      anchorId: 'luxury-consumer',
    },
  ];

  return (
    <>
      <JsonLd data={collectionPageSchema} />
      <JsonLd data={breadcrumbSchema} />
      <main className="w-full" style={{
        minHeight: '100vh',
        fontFamily: 'system-ui, Arial, sans-serif',
        background: '#f7f9fb',
      }}>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <header className="mb-6">
            <Breadcrumbs
              items={[
                { label: 'Home', href: '/' },
                { label: 'Archive', href: '/archive' },
                { label: `Week ${digest.weekLabel}` },
              ]}
            />
          </header>
        </div>

        {/* This Week's Cover */}
        {digest.coverImageUrl && (
          <section className="w-full max-w-[1404px] lg:max-w-[1638px] 2xl:max-w-[1825px] mx-auto px-4 md:px-8 mb-4 md:mb-5">
            <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3 md:mb-4">
                <h3 className="text-base md:text-lg font-semibold text-gray-900">
                  This week&apos;s cover
                </h3>
                <div className="flex items-center gap-3 flex-wrap text-xs md:text-sm text-gray-600">
                  <span>
                    {dateRange}
                    {digest.builtAtISO && (
                      <span className="ml-4">• Built {formatDateTime(digest.builtAtISO)}</span>
                    )}
                  </span>
                </div>
              </div>
              <div className="relative w-full rounded-lg overflow-hidden" style={{ height: '432px' }}>
                <img
                  src={digest.coverImageUrl}
                  alt={digest.coverImageAlt || `Weekly digest cover for ${digest.weekLabel}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-black bg-opacity-50 px-6 md:px-8 py-3 md:py-4 rounded-lg">
                    <h2 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      Week {digest.weekLabel}
                    </h2>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Intro & Key Themes */}
        {(digest.introParagraph || digest.keyThemes?.length || digest.oneSentenceSummary) && (
          <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-4 md:mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6 md:p-8">
              {(digest.introParagraph || digest.oneSentenceSummary) && (
                <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-6">
                  {digest.introParagraph || digest.oneSentenceSummary}
                </p>
              )}
              {digest.keyThemes && digest.keyThemes.length > 0 && (
                <div>
                  <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4">
                    Key themes this week
                  </h2>
                  <div className="flex flex-wrap gap-2.5">
                    {digest.keyThemes.map((theme, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Category Jump Navigation */}
        <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-4 md:mb-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-between w-full flex-wrap gap-4">
              <nav className="flex flex-wrap gap-2 justify-center flex-1" aria-label="Category navigation">
                {CATEGORY_CARDS.map(cat => (
                  <a
                    key={cat.anchorId}
                    href={`#${cat.anchorId}`}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 bg-gray-50 text-gray-700 rounded-full hover:bg-gray-100 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                  >
                    {cat.title}
                  </a>
                ))}
              </nav>
              <div className="text-right">
                <p className="text-sm md:text-base text-gray-500 whitespace-nowrap">
                  {digest.totals.total} articles processed this week
                </p>
              </div>
            </div>
            <div className="flex justify-center">
              <Suspense fallback={<div className="h-6 w-20" />}>
                <TopNSelector />
              </Suspense>
            </div>
          </div>
        </section>

        {/* CATEGORY SECTIONS UI - Client-side rendering with reactive TopN */}
        <Suspense fallback={
          <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-16 md:mb-20">
            <div className="w-full grid grid-cols-12 gap-8 lg:gap-10">
              {CATEGORY_CARDS.map(cat => (
                <div key={cat.key} className="col-span-12 lg:col-span-6 w-full">
                  <div className="bg-white rounded-lg border border-gray-100 p-4 md:p-7 h-64 animate-pulse" />
                </div>
              ))}
            </div>
          </section>
        }>
          <DigestClientView digest={digest} categoryCards={CATEGORY_CARDS} variant="home" />
        </Suspense>

        {/* Week Navigation */}
        <nav className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mt-12 md:mt-16 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 mb-4 text-center">Browse other weeks</p>
          <div className="flex items-center justify-between gap-4">
            {previousWeek ? (
              <Link
                href={`/week/${previousWeek}`}
                className="flex items-center gap-2 text-base text-gray-700 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded px-3 py-2"
              >
                <span className="text-gray-400">←</span>
                <span>Previous week</span>
                <span className="text-sm text-gray-500">({previousWeek})</span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
            {nextWeek ? (
              <Link
                href={`/week/${nextWeek}`}
                className="flex items-center gap-2 text-base text-gray-700 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded px-3 py-2 ml-auto"
              >
                <span className="text-sm text-gray-500">({nextWeek})</span>
                <span>Next week</span>
                <span className="text-gray-400">→</span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        </nav>
      </main>
    </>
  );
}

