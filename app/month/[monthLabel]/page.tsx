import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import { getTopicDisplayName, getTopicTotalsDisplayName } from '../../../utils/topicNames';

type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
  aiSummary?: string | null;
};

type MonthlyDigest = {
  monthLabel: string;
  tz: string;
  startISO: string;
  endISO: string;
  builtAtISO?: string;
  builtAtLocal?: string;
  totals: {
    total: number;
    byTopic: {
      Jewellery: number;
      Ecommerce: number;
      AIStrategy: number;
      Luxury: number;
    };
  };
  topics: {
    JewelleryIndustry: { total: number; top: Article[] };
    EcommerceTechnology: { total: number; top: Article[] };
    AIEcommerceStrategy: { total: number; top: Article[] };
    LuxuryConsumerBehaviour: { total: number; top: Article[] };
  };
};

function formatDate(isoString: string): string {
  return DateTime.fromISO(isoString).toFormat('yyyy-MM-dd');
}

async function loadDigest(monthLabel: string): Promise<MonthlyDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${monthLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as MonthlyDigest;
  } catch {
    return null;
  }
}

export default async function MonthPage({ params }: { params: { monthLabel: string } }) {
  const { monthLabel } = await params;
  
  // Validate format
  if (!/^\d{4}-\d{2}$/.test(monthLabel)) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Invalid Month Format</h1>
        <p style={{ color: '#666', fontSize: '1.1rem' }}>
          The month label "{monthLabel}" is not valid. Expected format: YYYY-MM (e.g., 2025-12).
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

  const digest = await loadDigest(monthLabel);

  if (!digest) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Digest Not Found</h1>
        <p style={{ color: '#666', fontSize: '1.1rem' }}>
          The digest for {monthLabel} has not been built yet.
        </p>
        <p style={{ color: '#666', fontSize: '1rem', marginTop: '1rem' }}>
          Run: <code style={{ background: '#f0f0f0', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>npx tsx scripts/buildMonthlyDigest.ts --month={monthLabel}</code>
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
            Monthly Digest: {digest.monthLabel}
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
          <strong>{getTopicTotalsDisplayName('Jewellery')}:</strong> {digest.totals.byTopic.Jewellery}
        </div>
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '6px' }}>
          <strong>{getTopicTotalsDisplayName('Ecommerce')}:</strong> {digest.totals.byTopic.Ecommerce}
        </div>
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '6px' }}>
          <strong>{getTopicTotalsDisplayName('AIStrategy')}:</strong> {digest.totals.byTopic.AIStrategy}
        </div>
        <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '6px' }}>
          <strong>{getTopicTotalsDisplayName('Luxury')}:</strong> {digest.totals.byTopic.Luxury}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '3rem' }}>
        {/* Jewellery Industry */}
        <section>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '2px solid #333', paddingBottom: '0.5rem' }}>
            {getTopicDisplayName('JewelleryIndustry')} ({digest.topics.JewelleryIndustry.total})
          </h2>
          {digest.topics.JewelleryIndustry.total > 0 ? (
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
              Total {digest.topics.JewelleryIndustry.total} articles this month. Showing top 7 by recency.
            </p>
          ) : (
            <p style={{ fontSize: '0.9rem', color: '#999', marginBottom: '1rem' }}>
              No articles for this topic in this month.
            </p>
          )}
          {digest.topics.JewelleryIndustry.top.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {digest.topics.JewelleryIndustry.top.map((article) => (
                <li key={article.id} style={{ marginBottom: '1.5rem' }}>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0066cc', textDecoration: 'none', fontWeight: '500' }}
                  >
                    {article.title}
                  </a>
                  <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.25rem' }}>
                    {formatDate(article.published_at)} | {article.source}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#999' }}>No articles</p>
          )}
        </section>

        {/* Ecommerce Technology */}
        <section>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '2px solid #333', paddingBottom: '0.5rem' }}>
            {getTopicDisplayName('EcommerceTechnology')} ({digest.topics.EcommerceTechnology.total})
          </h2>
          {digest.topics.EcommerceTechnology.total > 0 ? (
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
              Total {digest.topics.EcommerceTechnology.total} articles this month. Showing top 7 by recency.
            </p>
          ) : (
            <p style={{ fontSize: '0.9rem', color: '#999', marginBottom: '1rem' }}>
              No articles for this topic in this month.
            </p>
          )}
          {digest.topics.EcommerceTechnology.top.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {digest.topics.EcommerceTechnology.top.map((article) => (
                <li key={article.id} style={{ marginBottom: '1.5rem' }}>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0066cc', textDecoration: 'none', fontWeight: '500' }}
                  >
                    {article.title}
                  </a>
                  <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.25rem' }}>
                    {formatDate(article.published_at)} | {article.source}
                  </div>
                  {article.aiSummary && (
                    <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.5rem', fontStyle: 'italic', paddingLeft: '0.5rem', borderLeft: '2px solid #ddd' }}>
                      <strong>AI-generated summary (from headline + snippet):</strong> {article.aiSummary}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#999' }}>No articles</p>
          )}
        </section>

        {/* AI & Ecommerce Strategy */}
        <section>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '2px solid #333', paddingBottom: '0.5rem' }}>
            {getTopicDisplayName('AIEcommerceStrategy')} ({digest.topics.AIEcommerceStrategy.total})
          </h2>
          {digest.topics.AIEcommerceStrategy.total > 0 ? (
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
              Total {digest.topics.AIEcommerceStrategy.total} articles this month. Showing top 7 by recency.
            </p>
          ) : (
            <p style={{ fontSize: '0.9rem', color: '#999', marginBottom: '1rem' }}>
              No articles for this topic in this month.
            </p>
          )}
          {digest.topics.AIEcommerceStrategy.top.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {digest.topics.AIEcommerceStrategy.top.map((article) => (
                <li key={article.id} style={{ marginBottom: '1.5rem' }}>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0066cc', textDecoration: 'none', fontWeight: '500' }}
                  >
                    {article.title}
                  </a>
                  <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.25rem' }}>
                    {formatDate(article.published_at)} | {article.source}
                  </div>
                  {article.aiSummary && (
                    <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.5rem', fontStyle: 'italic', paddingLeft: '0.5rem', borderLeft: '2px solid #ddd' }}>
                      <strong>AI-generated summary (from headline + snippet):</strong> {article.aiSummary}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#999' }}>No articles</p>
          )}
        </section>

        {/* Luxury Consumer Behaviour */}
        <section>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '2px solid #333', paddingBottom: '0.5rem' }}>
            {getTopicDisplayName('LuxuryConsumerBehaviour')} ({digest.topics.LuxuryConsumerBehaviour.total})
          </h2>
          {digest.topics.LuxuryConsumerBehaviour.total > 0 ? (
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
              Total {digest.topics.LuxuryConsumerBehaviour.total} articles this month. Showing top 7 by recency.
            </p>
          ) : (
            <p style={{ fontSize: '0.9rem', color: '#999', marginBottom: '1rem' }}>
              No articles for this topic in this month.
            </p>
          )}
          {digest.topics.LuxuryConsumerBehaviour.top.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {digest.topics.LuxuryConsumerBehaviour.top.map((article) => (
                <li key={article.id} style={{ marginBottom: '1.5rem' }}>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0066cc', textDecoration: 'none', fontWeight: '500' }}
                  >
                    {article.title}
                  </a>
                  <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.25rem' }}>
                    {formatDate(article.published_at)} | {article.source}
                  </div>
                  {article.aiSummary && (
                    <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.5rem', fontStyle: 'italic', paddingLeft: '0.5rem', borderLeft: '2px solid #ddd' }}>
                      <strong>AI-generated summary (from headline + snippet):</strong> {article.aiSummary}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#999' }}>No articles</p>
          )}
        </section>
      </div>
    </div>
  );
}





