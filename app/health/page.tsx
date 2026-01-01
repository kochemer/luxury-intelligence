import { promises as fs } from 'fs';
import path from 'path';
import { getTopicTotalsDisplayName } from '../../utils/topicNames';

async function getLatestDigest() {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files = await fs.readdir(digestsDir);
    const monthLabels = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .filter(label => /^\d{4}-\d{2}$/.test(label))
      .sort()
      .reverse(); // Most recent first
    
    if (monthLabels.length === 0) {
      return null;
    }
    
    const latestMonth = monthLabels[0];
    const digestPath = path.join(digestsDir, `${latestMonth}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function HealthPage() {
  const digest = await getLatestDigest();

  if (!digest) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Health Check</h1>
        <p style={{ color: '#666', fontSize: '1.1rem' }}>
          No digests available. The system is healthy but no monthly digests have been built yet.
        </p>
        <p style={{ color: '#666', fontSize: '1rem', marginTop: '1rem' }}>
          Run: <code style={{ background: '#f0f0f0', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>npx tsx scripts/buildMonthlyDigest.ts</code>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>Health Check</h1>
      
      <div style={{ background: '#f9f9f9', padding: '1.5rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Latest Digest</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>Month:</strong> {digest.monthLabel}
        </p>
        {digest.builtAtLocal && (
          <p style={{ marginBottom: '0.5rem' }}>
            <strong>Built At (Local):</strong> {digest.builtAtLocal} ({digest.tz})
          </p>
        )}
        {digest.builtAtISO && (
          <p style={{ marginBottom: '0.5rem' }}>
            <strong>Built At (ISO):</strong> {digest.builtAtISO}
          </p>
        )}
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>Period:</strong> {digest.startISO.split('T')[0]} to {digest.endISO.split('T')[0]}
        </p>
      </div>

      <div style={{ background: '#f9f9f9', padding: '1.5rem', borderRadius: '6px' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Totals by Topic</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div>
            <strong>Total Articles:</strong> {digest.totals.total}
          </div>
          <div>
            <strong>{getTopicTotalsDisplayName('Jewellery')}:</strong> {digest.totals.byTopic.Jewellery}
          </div>
          <div>
            <strong>{getTopicTotalsDisplayName('Ecommerce')}:</strong> {digest.totals.byTopic.Ecommerce}
          </div>
          <div>
            <strong>{getTopicTotalsDisplayName('AIStrategy')}:</strong> {digest.totals.byTopic.AIStrategy}
          </div>
          <div>
            <strong>{getTopicTotalsDisplayName('Luxury')}:</strong> {digest.totals.byTopic.Luxury}
          </div>
        </div>
      </div>
    </div>
  );
}

