import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { DateTime } from 'luxon';
import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app";

export const metadata: Metadata = {
  title: 'Arkiv – Ugentlige AI og Luksus Brancheoversigter',
  description: 'Gennemse det komplette arkiv af ugentlige AI, ecommerce, luksus og smykkebrancheoversigter. Få adgang til alle tidligere kurerede intelligensoversigter og ugentlige resuméer.',
  alternates: {
    canonical: '/da/archive',
  },
  openGraph: {
    title: 'Arkiv – Ugentlige AI og Luksus Brancheoversigter',
    description: 'Gennemse det komplette arkiv af ugentlige AI, ecommerce, luksus og smykkebrancheoversigter. Få adgang til alle tidligere kurerede intelligensoversigter og ugentlige resuméer.',
    images: [`${siteUrl}/og-default.svg`],
  },
  twitter: {
    title: 'Arkiv – Ugentlige AI og Luksus Brancheoversigter',
    description: 'Gennemse det komplette arkiv af ugentlige AI, ecommerce, luksus og smykkebrancheoversigter. Få adgang til alle tidligere kurerede intelligensoversigter og ugentlige resuméer.',
    images: [`${siteUrl}/og-default.svg`],
  },
};

async function getAvailableDigests(): Promise<string[]> {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files = await fs.readdir(digestsDir);
    const weekLabels = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .filter(label => /^\d{4}-W\d{1,2}$/.test(label))
      .sort((a, b) => {
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
  return `Uge ${week}, ${year}`;
}

export default async function ArchivePageDA() {
  const digests = await getAvailableDigests();

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
      <header className="mb-12 md:mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
          Oversigtsarkiv
        </h1>
        <Link href="/da" className="text-blue-600 hover:text-blue-800 underline text-sm md:text-base">
          ← Tilbage til start
        </Link>
      </header>

      {digests.length > 0 ? (
        <div>
          <p className="text-base md:text-lg text-gray-600 mb-8 leading-relaxed">
            Tilgængelige ugentlige oversigter ({digests.length}):
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
          Ingen oversigter tilgængelige endnu. Kør <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">npx tsx scripts/buildWeeklyDigest.ts</code> for at oprette oversigter.
        </p>
      )}
    </div>
  );
}

