import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import CategorySection from '../../components/CategorySection';
import { getTopicDisplayName, getTopicTotalsDisplayName } from '../../../utils/topicNames';
import { formatDate } from '../../../utils/formatDate';

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


async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch {
    return null;
  }
}

export default async function WeekPage({ params }: { params: { weekLabel: string } }) {
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

  const startDate = formatDate(digest.startISO);
  const endDate = formatDate(digest.endISO);

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
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            Weekly Brief: {digest.weekLabel}
          </h1>
          <p className="text-base md:text-lg text-gray-600 mb-2">
            Period: {startDate} to {endDate} ({digest.tz})
          </p>
          {digest.builtAtLocal && (
            <p className="text-sm text-gray-500 mb-2">
              Last built: {digest.builtAtLocal} ({digest.tz})
            </p>
          )}
          <p className="text-base md:text-lg text-gray-600">
            Total articles: <strong className="text-gray-900">{digest.totals.total}</strong>
          </p>
        </div>
      </header>

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

      <div className="space-y-12 md:space-y-16">
        {/* AI & Strategy */}
        <CategorySection
          title={getTopicDisplayName('AI_and_Strategy')}
          count={digest.topics.AI_and_Strategy.total}
          articles={digest.topics.AI_and_Strategy.top.map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
        />

        {/* Ecommerce & Retail Tech */}
        <CategorySection
          title={getTopicDisplayName('Ecommerce_Retail_Tech')}
          count={digest.topics.Ecommerce_Retail_Tech.total}
          articles={digest.topics.Ecommerce_Retail_Tech.top.map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
        />

        {/* Luxury & Consumer */}
        <CategorySection
          title={getTopicDisplayName('Luxury_and_Consumer')}
          count={digest.topics.Luxury_and_Consumer.total}
          articles={digest.topics.Luxury_and_Consumer.top.map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
        />

        {/* Jewellery Industry */}
        <CategorySection
          title={getTopicDisplayName('Jewellery_Industry')}
          count={digest.topics.Jewellery_Industry.total}
          articles={digest.topics.Jewellery_Industry.top.map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
        />
      </div>
    </div>
  );
}

