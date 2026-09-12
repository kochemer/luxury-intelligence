import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { formatDateRange } from '@/lib/utils/formatDate';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Archivo – Resúmenes Semanales',
  description: 'Explora el archivo completo de resúmenes semanales de IA, ecommerce, lujo y joyería. Accede a todos los informes de inteligencia curados.',
  alternates: {
    canonical: `${siteUrl}/es/archive`,
    languages: {
      'en': `${siteUrl}/archive`,
      'es': `${siteUrl}/es/archive`,
      'da': `${siteUrl}/da/archive`,
      'x-default': `${siteUrl}/archive`,
    },
  },
  openGraph: {
    title: 'Archivo – Resúmenes Semanales',
    description: 'Explora el archivo completo de resúmenes semanales de IA, ecommerce, lujo y joyería. Accede a todos los informes de inteligencia curados.',
    images: [`${siteUrl}/api/og`],
  },
  twitter: {
    title: 'Archivo – Resúmenes Semanales',
    description: 'Explora el archivo completo de resúmenes semanales de IA, ecommerce, lujo y joyería. Accede a todos los informes de inteligencia curados.',
    images: [`${siteUrl}/api/og`],
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

type WeekMeta = {
  dateRange: string | null;
  coverImageUrl?: string;
  coverImageAlt?: string;
  totalArticles: number;
  categoryCount: number;
  topArticleTitle?: string;
};

async function getWeekMeta(weekLabel: string): Promise<WeekMeta> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    const digest = JSON.parse(raw);
    const dateRange = digest.startISO && digest.endISO ? formatDateRange(digest.startISO, digest.endISO) : null;
    const byTopic = digest.totals?.byTopic as Record<string, number> | undefined;
    const categoryCount = byTopic ? Object.values(byTopic).filter((v: number) => v > 0).length : 0;
    let topArticleTitle: string | undefined;
    const topics = digest.topics as Record<string, { top?: { title?: string }[] }> | undefined;
    if (topics) {
      for (const t of Object.values(topics)) {
        if (t?.top?.[0]?.title) { topArticleTitle = t.top[0].title; break; }
      }
    }
    return { dateRange, coverImageUrl: digest.coverImageUrl, coverImageAlt: digest.coverImageAlt, totalArticles: digest.totals?.total ?? 0, categoryCount, topArticleTitle };
  } catch {
    return { dateRange: null, totalArticles: 0, categoryCount: 0 };
  }
}

function extractIssueLabel(weekLabel: string): string {
  const match = weekLabel.match(/W(\d+)$/);
  return match ? `W${match[1].padStart(2, '0')}` : weekLabel;
}

export default async function ArchivePageES() {
  const weekLabels = await getAvailableDigests();
  const issues = await Promise.all(
    weekLabels.map(async (weekLabel, i) => {
      const meta = await getWeekMeta(weekLabel);
      return { weekLabel, meta, issue: extractIssueLabel(weekLabel), i };
    })
  );

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-16 md:py-20">
      <header className="max-w-2xl mb-12 md:mb-16">
        <Link href="/es" className="text-[var(--color-accent)] hover:text-[var(--color-text-primary)] text-meta inline-block mb-6 transition-colors">
          ← Volver al inicio
        </Link>
        <p className="text-[11px] tracking-[0.3em] uppercase text-[var(--color-accent)] font-sans font-semibold mb-3">
          Todas las ediciones
        </p>
        <h1 className="font-serif font-normal text-[2.75rem] leading-none tracking-[-0.02em] text-[var(--color-text-primary)] mb-4">
          Archivo de Resúmenes
        </h1>
        <p className="text-body text-[var(--color-text-secondary)]">
          {weekLabels.length} ediciones · IA, ecommerce, lujo &amp; joyería
        </p>
        <hr className="border-[var(--color-accent)] border-t-2 mt-6" />
      </header>

      {issues.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {issues.map(({ weekLabel, meta, issue, i }) => (
            <Link
              key={weekLabel}
              href={`/digest/${weekLabelToSlug(weekLabel)}`}
              className={`group relative overflow-hidden rounded-sm ${
                i === 0 ? 'col-span-2 row-span-2 aspect-[3/2]' : 'aspect-[3/2]'
              }`}
            >
              {meta.coverImageUrl ? (
                <Image
                  // Covers are ~2.5 MB PNGs and this page shows every issue;
                  // raw <img> referenced ~94 MB. See app/archive/page.tsx.
                  src={meta.coverImageUrl}
                  alt={meta.coverImageAlt || `Portada para ${weekLabel}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div
                  className="absolute inset-0 w-full h-full"
                  style={{ background: `linear-gradient(135deg, var(--color-deep) 0%, var(--color-accent) 100%)` }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4">
                <p className="text-[10px] tracking-[0.25em] uppercase text-white/60 font-sans mb-0.5">{issue}</p>
                <p className={`font-serif text-white leading-snug ${i === 0 ? 'text-base md:text-lg' : 'text-xs md:text-sm'}`}>
                  {meta.dateRange || weekLabel}
                </p>
                {meta.totalArticles > 0 && (
                  <p className="text-[11px] text-white/50 font-sans mt-1">{meta.totalArticles} artículos</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--color-accent-light)] border-l-4 border-[var(--color-accent)] p-5 rounded-sm">
          <p className="text-body text-[var(--color-text-primary)] mb-2 font-medium">Aún no hay ediciones.</p>
          <p className="text-body text-[var(--color-text-secondary)]">
            Ejecuta <code className="bg-[var(--color-surface)] px-2 py-1 rounded text-meta font-mono border border-[var(--color-border)]">npx tsx scripts/buildWeeklyDigest.ts</code> para crear resúmenes.
          </p>
        </div>
      )}
    </div>
  );
}
