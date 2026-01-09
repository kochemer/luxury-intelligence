import { Suspense } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import type { Metadata } from 'next';
import DigestClientView from '../../components/DigestClientView';
import TopNSelector from '../../components/TopNSelector';
import { getTopicTotalsDisplayName } from '../../../utils/topicNames';
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

export default async function WeekPage({ 
  params
}: { 
  params: { weekLabel: string };
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

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
      <header className="mb-12 md:mb-16">
        <div className="mb-6">
          <div className="flex gap-4 mb-6">
            <Link href="/" className="text-blue-600 hover:text-blue-800 underline text-sm md:text-base">
              ← Home
            </Link>
            <Link href="/archive" className="text-blue-600 hover:text-blue-800 underline text-sm md:text-base">
              Archive
            </Link>
          </div>
          <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
                Weekly Brief: {digest.weekLabel}
              </h1>
              <p className="text-base md:text-lg text-gray-600 mb-2">
                Period: {dateRange}
              </p>
              {digest.builtAtISO && (
                <p className="text-sm text-gray-500 mb-2">
                  Last built: {formatDateTime(digest.builtAtISO)} ({digest.tz})
                </p>
              )}
              <p className="text-base md:text-lg text-gray-600">
                Total articles: <strong className="text-gray-900">{digest.totals.total}</strong>
              </p>
            </div>
            <div className="flex-shrink-0">
              <Suspense fallback={<div className="h-6 w-20" />}>
                <TopNSelector />
              </Suspense>
            </div>
          </div>
        </div>
      </header>

      {/* This Week's Cover */}
      {digest.coverImageUrl && (
        <section className="mb-8 md:mb-10">
          <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-3 md:mb-4">
              This week&apos;s cover
            </h2>
            <div className="relative w-full rounded-lg overflow-hidden" style={{ height: '432px' }}>
              <img
                src={digest.coverImageUrl}
                alt={digest.coverImageAlt || `Weekly digest cover for ${digest.weekLabel}`}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12 md:mb-16">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">{getTopicTotalsDisplayName('AIStrategy')}</p>
          <p className="text-2xl font-semibold text-gray-900">{digest.totals.byTopic.AIStrategy}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">{getTopicTotalsDisplayName('EcommerceRetail')}</p>
          <p className="text-2xl font-semibold text-gray-900">{digest.totals.byTopic.EcommerceRetail}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">{getTopicTotalsDisplayName('LuxuryConsumer')}</p>
          <p className="text-2xl font-semibold text-gray-900">{digest.totals.byTopic.LuxuryConsumer}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">{getTopicTotalsDisplayName('Jewellery')}</p>
          <p className="text-2xl font-semibold text-gray-900">{digest.totals.byTopic.Jewellery}</p>
        </div>
      </div>

      <Suspense fallback={
        <div className="space-y-12 md:space-y-16">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-lg border border-gray-100 p-4 md:p-7 h-64 animate-pulse" />
          ))}
        </div>
      }>
        <DigestClientView digest={digest} variant="week" />
      </Suspense>
    </div>
  );
}

