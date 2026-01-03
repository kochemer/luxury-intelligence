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
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Invalid Week Format</h1>
        <p style={{ color: '#666', fontSize: '1.1rem' }}>
          The week label "{weekLabel}" is not valid. Expected format: YYYY-W## (e.g., 2025-W52).
        </p>
        <div style={{ marginTop: '2rem' }}>
          <Link href="/archive" style={{ color: '#0066cc', textDecoration: 'none', marginRight: '1rem' }}>
            ← Archive
          </Link>
          <Link href="/" style={{ color: '#0066cc', textDecoration: 'none' }}>
            Home
          </Link>
        </div>
      </div>
    );
  }

  const digest = await loadDigest(weekLabel);

  if (!digest) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Digest Not Found</h1>
        <p style={{ color: '#666', fontSize: '1.1rem' }}>
          The digest for {weekLabel} has not been built yet.
        </p>
        <p style={{ color: '#666', fontSize: '1rem', marginTop: '1rem' }}>
          Run: <code style={{ background: '#f0f0f0', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>npx tsx scripts/buildWeeklyDigest.ts --week={weekLabel}</code>
        </p>
        <div style={{ marginTop: '2rem' }}>
          <Link href="/archive" style={{ color: '#0066cc', textDecoration: 'none', marginRight: '1rem' }}>
            ← Archive
          </Link>
          <Link href="/" style={{ color: '#0066cc', textDecoration: 'none' }}>
            Home
          </Link>
        </div>
      </div>
    );
  }

  const startDate = formatDate(digest.startISO);
  const endDate = formatDate(digest.endISO);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif', lineHeight: '1.6' }}>
      <header style={{ marginBottom: '3rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <Link href="/" style={{ color: '#0066cc', textDecoration: 'none', marginRight: '1rem' }}>
            ← Home
          </Link>
          <Link href="/archive" style={{ color: '#0066cc', textDecoration: 'none' }}>
            Archive
          </Link>
        </div>
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', fontWeight: '600' }}>
            Weekly Digest: {digest.weekLabel}
          </h1>
          {digest.builtAtLocal && (
            <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Last built: {digest.builtAtLocal} ({digest.tz})
            </p>
          )}
        </div>
        <p style={{ color: '#666', fontSize: '1.1rem' }}>
          Period: {startDate} to {endDate} ({digest.tz})
        </p>
        <p style={{ color: '#666', fontSize: '1rem', marginTop: '0.5rem' }}>
          Total articles: <strong>{digest.totals.total}</strong>
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', marginBottom: '3rem' }}>
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '6px' }}>
          <strong>{getTopicTotalsDisplayName('AIStrategy')}:</strong> {digest.totals.byTopic.AIStrategy}
        </div>
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '6px' }}>
          <strong>{getTopicTotalsDisplayName('EcommerceRetail')}:</strong> {digest.totals.byTopic.EcommerceRetail}
        </div>
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '6px' }}>
          <strong>{getTopicTotalsDisplayName('LuxuryConsumer')}:</strong> {digest.totals.byTopic.LuxuryConsumer}
        </div>
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '6px' }}>
          <strong>{getTopicTotalsDisplayName('Jewellery')}:</strong> {digest.totals.byTopic.Jewellery}
        </div>
      </div>

      <div style={{ maxWidth: '1200px' }}>
        {/* AI & Strategy */}
        <CategorySection
          title={getTopicDisplayName('AI_and_Strategy')}
          count={digest.topics.AI_and_Strategy.total}
          articles={digest.topics.AI_and_Strategy.top.map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
          rankingLabel="Top 7 articles by relevance"
        />

        {/* Ecommerce & Retail Tech */}
        <CategorySection
          title={getTopicDisplayName('Ecommerce_Retail_Tech')}
          count={digest.topics.Ecommerce_Retail_Tech.total}
          articles={digest.topics.Ecommerce_Retail_Tech.top.map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
          rankingLabel="Top 7 articles by relevance"
        />

        {/* Luxury & Consumer */}
        <CategorySection
          title={getTopicDisplayName('Luxury_and_Consumer')}
          count={digest.topics.Luxury_and_Consumer.total}
          articles={digest.topics.Luxury_and_Consumer.top.map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
          rankingLabel="Top 7 articles by relevance"
        />

        {/* Jewellery Industry */}
        <CategorySection
          title={getTopicDisplayName('Jewellery_Industry')}
          count={digest.topics.Jewellery_Industry.total}
          articles={digest.topics.Jewellery_Industry.top.map(article => ({
            ...article,
            date: formatDate(article.published_at),
          }))}
          rankingLabel="Top 7 articles by relevance"
        />
      </div>
    </div>
  );
}

