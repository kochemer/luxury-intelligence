/**
 * This script renders an archive page for monthly digests in a Next.js application.
 * 
 * - It scans the folder `data/digests` on the server to find all available monthly digest files.
 * - Each digest file must be named in the format `YYYY-MM.json` (e.g., 2024-05.json).
 * - The page lists all available digests in reverse chronological order,
 *   displaying a friendly month name and linking to the detail page for each digest.
 * - If no digests are available, it shows a message instructing the user to run `scripts/buildMonthlyDigest.ts`
 *   to create digest files.
 * 
 * The data is loaded and rendered server-side, so the archive reflects the current contents of the digests directory.
 */

import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';

async function getAvailableDigests(): Promise<string[]> {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files = await fs.readdir(digestsDir);
    const monthLabels = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .filter(label => /^\d{4}-\d{2}$/.test(label))
      .sort()
      .reverse(); // Most recent first
    return monthLabels;
  } catch {
    return [];
  }
}

export default async function ArchivePage() {
  const digests = await getAvailableDigests();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', fontWeight: '600' }}>
          Digest Archive
        </h1>
        <Link href="/" style={{ color: '#0066cc', textDecoration: 'none' }}>
          ← Back to Home
        </Link>
      </header>

      {digests.length > 0 ? (
        <div>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Available monthly digests ({digests.length}):
          </p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {digests.map((monthLabel) => {
              const [year, month] = monthLabel.split('-');
              const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
              return (
                <li key={monthLabel} style={{ marginBottom: '0.75rem' }}>
                  <Link
                    href={`/month/${monthLabel}`}
                    style={{
                      display: 'block',
                      padding: '1rem',
                      background: '#f9f9f9',
                      borderRadius: '6px',
                      color: '#0066cc',
                      textDecoration: 'none',
                    }}
                  >
                    <strong>{monthName}</strong> ({monthLabel})
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p style={{ color: '#666' }}>
          No digests available yet. Run <code style={{ background: '#f0f0f0', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>scripts/buildMonthlyDigest.ts</code> to create digests.
        </p>
      )}
    </div>
  );
}
