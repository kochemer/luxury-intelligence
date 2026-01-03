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
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
      <header className="mb-12 md:mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
          Digest Archive
        </h1>
        <Link href="/" className="text-blue-600 hover:text-blue-800 underline text-sm md:text-base">
          ← Back to Home
        </Link>
      </header>

      {digests.length > 0 ? (
        <div>
          <p className="text-base md:text-lg text-gray-600 mb-8 leading-relaxed">
            Available weekly briefs ({digests.length}):
          </p>
          <ul className="space-y-3">
            {digests.map((weekLabel) => {
              const formatted = formatWeekLabel(weekLabel);
              return (
                <li key={weekLabel}>
                  <Link
                    href={`/week/${weekLabel}`}
                    className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-colors"
                  >
                    <span className="font-semibold text-gray-900">{formatted}</span>
                    <span className="text-sm text-gray-500 ml-2">({weekLabel})</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-base md:text-lg text-gray-600 leading-relaxed">
          No digests available yet. Run <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">npx tsx scripts/buildWeeklyDigest.ts</code> to create digests.
        </p>
      )}
    </div>
  );
}
