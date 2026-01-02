/**
 * This script renders an archive page for weekly digests in a Next.js application.
 * 
 * - It scans the folder `data/digests` on the server to find all available weekly digest files.
 * - Each digest file must be named in the format `YYYY-W##.json` (e.g., 2025-W52.json).
 * - The page lists all available digests in reverse chronological order,
 *   displaying a friendly week label and linking to the detail page for each digest.
 * - If no digests are available, it shows a message instructing the user to run `scripts/buildWeeklyDigest.ts`
 *   to create digest files.
 * 
 * The data is loaded and rendered server-side, so the archive reflects the current contents of the digests directory.
 */

import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { DateTime } from 'luxon';

async function getAvailableDigests(): Promise<string[]> {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files = await fs.readdir(digestsDir);
    const weekLabels = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .filter(label => /^\d{4}-W\d{1,2}$/.test(label))
      .sort((a, b) => {
        // Sort by year and week number
        const [yearA, weekA] = a.split('-W').map(Number);
        const [yearB, weekB] = b.split('-W').map(Number);
        if (yearA !== yearB) return yearB - yearA;
        return weekB - weekA;
      });
    return weekLabels;
  } catch {
    return [];
  }
}

function formatWeekLabel(weekLabel: string): string {
  const [year, week] = weekLabel.split('-W').map(Number);
  return `Week ${week}, ${year}`;
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
            Available weekly digests ({digests.length}):
          </p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {digests.map((weekLabel) => {
              const formatted = formatWeekLabel(weekLabel);
              return (
                <li key={weekLabel} style={{ marginBottom: '0.75rem' }}>
                  <Link
                    href={`/week/${weekLabel}`}
                    style={{
                      display: 'block',
                      padding: '1rem',
                      background: '#f9f9f9',
                      borderRadius: '6px',
                      color: '#0066cc',
                      textDecoration: 'none',
                    }}
                  >
                    <strong>{formatted}</strong> ({weekLabel})
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p style={{ color: '#666' }}>
          No digests available yet. Run <code style={{ background: '#f0f0f0', padding: '0.2rem 0.4rem', borderRadius: '3px' }}>npx tsx scripts/buildWeeklyDigest.ts</code> to create digests.
        </p>
      )}
    </div>
  );
}
