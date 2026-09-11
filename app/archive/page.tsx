/**
 * Archive page for weekly digests.
 * 
 * - Scans `data/digests` for weekly digest files (YYYY-W##.json format)
 * - Lists all available weekly digests in reverse chronological order
 * - Links to individual week pages at /week/[weekLabel]
 */

import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { DateTime } from 'luxon';
import type { Metadata } from 'next';
import { formatDateRange } from '@/lib/utils/formatDate';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { buildArchiveCollectionLd } from '@/lib/seo/jsonLd';
import JsonLd from '../components/JsonLd';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Archive – All Weekly Digests',
  description: 'Browse all editions of the Luxury Intelligence weekly digest. Weekly analysis of AI, ecommerce, jewellery, and luxury industry news.',
  alternates: {
    canonical: `${siteUrl}/archive`,
    languages: {
      'en': `${siteUrl}/archive`,
      'es': `${siteUrl}/es/archive`,
      'da': `${siteUrl}/da/archive`,
      'x-default': `${siteUrl}/archive`,
    },
  },
  openGraph: {
    title: 'Archive – All Weekly Digests | Luxury Intelligence',
    description: 'Browse all editions of the Luxury Intelligence weekly digest. Weekly analysis of AI, ecommerce, jewellery, and luxury industry news.',
    images: [`${siteUrl}/api/og`],
  },
  twitter: {
    title: 'Archive – All Weekly Digests | Luxury Intelligence',
    description: 'Browse all editions of the Luxury Intelligence weekly digest. Weekly analysis of AI, ecommerce, jewellery, and luxury industry news.',
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
      .filter(label => /^\d{4}-W\d{1,2}$/.test(label)) // Weekly format: YYYY-W##
      .sort((a, b) => {
        // Sort by year and week number
        const [yearA, weekA] = a.split('-W').map(Number);
        const [yearB, weekB] = b.split('-W').map(Number);
        if (yearA !== yearB) return yearB - yearA; // Newer years first
        return weekB - weekA; // Higher week numbers first
      });
    return weekLabels;
  } catch {
    return [];
  }
}

type WeekMeta = {
  dateRange: string | null;
  startISO?: string;
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
        if (t?.top?.[0]?.title) {
          topArticleTitle = t.top[0].title;
          break;
        }
      }
    }

    return {
      dateRange,
      startISO: digest.startISO,
      coverImageUrl: digest.coverImageUrl,
      coverImageAlt: digest.coverImageAlt,
      totalArticles: digest.totals?.total ?? 0,
      categoryCount,
      topArticleTitle,
    };
  } catch {
    return { dateRange: null, totalArticles: 0, categoryCount: 0 };
  }
}

function extractIssueLabel(weekLabel: string): string {
  const match = weekLabel.match(/W(\d+)$/);
  return match ? `W${match[1].padStart(2, '0')}` : weekLabel;
}

function getMonthGroup(weekLabel: string, startISO?: string): string {
  if (startISO) {
    return DateTime.fromISO(startISO).toFormat('MMMM yyyy');
  }
  const [y, w] = weekLabel.split('-');
  const year = parseInt(y ?? String(DateTime.now().year), 10);
  const week = parseInt((w ?? 'W1').replace(/^W/i, ''), 10);
  return DateTime.fromObject({ weekYear: year, weekNumber: week }).toFormat('MMMM yyyy');
}

export default async function ArchivePage() {
  const weekLabels = await getAvailableDigests();
  const issues = await Promise.all(
    weekLabels.map(async (weekLabel) => {
      const meta = await getWeekMeta(weekLabel);
      return { weekLabel, meta, issue: extractIssueLabel(weekLabel) };
    })
  );

  // Group issues by month (order preserved — newest first)
  const monthMap = new Map<string, typeof issues>();
  for (const issue of issues) {
    const month = getMonthGroup(issue.weekLabel, issue.meta.startISO);
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(issue);
  }
  const monthGroups = Array.from(monthMap.entries());
  const totalMonths = monthGroups.length;

  // Group months by year for H2 year headings
  const yearMap = new Map<string, Array<[string, typeof issues]>>();
  for (const [month, monthIssues] of monthGroups) {
    const year = month.split(' ')[1] ?? month;
    if (!yearMap.has(year)) yearMap.set(year, []);
    yearMap.get(year)!.push([month, monthIssues]);
  }
  const yearGroups = Array.from(yearMap.entries());

  // Global index so the very first card gets the hero + gold ring treatment
  let globalIdx = 0;

  // The archive is an index of every issue, but carried no structured data —
  // so a machine reading it saw an undifferentiated page of links rather than
  // an ordered collection of dated publications. Newest first, matching the
  // visual order.
  const collectionSchema = buildArchiveCollectionLd({
    siteUrl,
    url: `${siteUrl}/archive`,
    name: 'Archive – All Weekly Digests',
    description: `All ${weekLabels.length} editions of the Luxury Intelligence weekly digest, covering AI, ecommerce, jewellery and luxury industry news.`,
    entries: [...issues].reverse().map(({ weekLabel, meta }) => ({
      url: `${siteUrl}/digest/${weekLabelToSlug(weekLabel)}`,
      // WeekMeta already carries the formatted range the page displays; reuse
      // it so the structured data and the visible list cannot disagree.
      name: meta.dateRange ?? weekLabel,
      ...(meta.startISO ? { datePublished: meta.startISO } : {}),
    })),
  });

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-16 md:py-20">
      <JsonLd data={collectionSchema} />
      {/* Editorial header */}
      <header className="max-w-2xl mb-12 md:mb-16">
        <Link
          href="/"
          className="text-[var(--color-accent)] hover:text-[var(--color-text-primary)] text-meta inline-block mb-6 transition-colors"
        >
          ← Back to Home
        </Link>
        <p className="text-[11px] tracking-[0.3em] uppercase text-[var(--color-accent)] font-sans font-semibold mb-3">
          All Issues
        </p>
        <h1 className="font-serif font-normal text-[2.75rem] leading-none tracking-[-0.02em] text-[var(--color-text-primary)] mb-4">
          Luxury Intelligence Archive – Weekly AI, Ecommerce &amp; Jewellery Digests
        </h1>
        <p className="text-body text-[var(--color-text-secondary)] mb-3">
          Browse every edition of the Luxury Intelligence weekly digest. Each issue analyses hundreds of articles across AI strategy, ecommerce innovation, jewellery industry news, and luxury brand trends — curated and summarised for senior professionals.
        </p>
        <p className="text-meta text-[var(--color-text-secondary)]">
          {weekLabels.length} issue{weekLabels.length !== 1 ? 's' : ''} across {totalMonths} month{totalMonths !== 1 ? 's' : ''} — and counting
        </p>
        <hr className="border-[var(--color-accent)] border-t-2 mt-6" />
      </header>

      {issues.length > 0 ? (
        <div>
          {yearGroups.map(([year, yearMonths], yearIdx) => (
            <section key={year} className={yearIdx > 0 ? 'mt-16' : ''}>
              {/* Year heading */}
              <h2 className="font-mono text-[13px] tracking-[0.3em] uppercase text-[var(--color-text-primary)] bg-[var(--color-surface)] border border-[var(--color-border)] inline-block px-3 py-1 mb-8">
                {year}
              </h2>

              {yearMonths.map(([month, monthIssues]) => {
            const monthBlock = (
              <div key={month}>
                {/* Month divider */}
                <div className="flex items-center gap-4 mt-10 mb-6 first:mt-0">
                  <span className="font-mono text-[11px] tracking-[0.25em] uppercase text-[var(--color-accent)]">
                    {month}
                  </span>
                  <div className="flex-1 h-px bg-[var(--color-border)]" />
                  <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                    {monthIssues.length} issue{monthIssues.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Grid for this month */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                  {monthIssues.map(({ weekLabel, meta, issue }) => {
                    const isFirst = globalIdx === 0;
                    globalIdx++;
                    return (
                      <Link
                        key={weekLabel}
                        href={`/digest/${weekLabelToSlug(weekLabel)}`}
                        className={`group relative overflow-hidden rounded-sm ${
                          isFirst ? 'col-span-2 row-span-2 aspect-[3/2]' : 'aspect-[3/2]'
                        }`}
                      >
                        {/* Cover image, typographic fallback, or gradient */}
                        {meta.coverImageUrl ? (
                          <img
                            src={meta.coverImageUrl}
                            alt={meta.coverImageAlt || `Cover for ${weekLabel}`}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-[var(--color-deep)] flex items-center justify-center overflow-hidden">
                            <span className="font-serif font-light text-[6rem] leading-none text-white/10 select-none pointer-events-none">
                              {issue}
                            </span>
                          </div>
                        )}

                        {/* Dark gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                        {/* Gold ring on most-recent issue */}
                        {isFirst && (
                          <div
                            className="absolute inset-0 pointer-events-none rounded-sm z-10"
                            style={{ boxShadow: 'inset 0 0 0 2px var(--color-accent)' }}
                          />
                        )}

                        {/* Issue metadata */}
                        <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 z-[5]">
                          <p className="text-[10px] tracking-[0.25em] uppercase text-white/60 font-sans mb-0.5">
                            {issue}
                          </p>
                          <p className={`font-serif text-white leading-snug ${isFirst ? 'text-base md:text-lg' : 'text-xs md:text-sm'}`}>
                            {meta.dateRange || weekLabel}
                          </p>
                          {meta.totalArticles > 0 && (
                            <p className="text-[11px] text-white/50 font-sans mt-1">
                              {meta.totalArticles} articles
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
            return monthBlock;
          })}
            </section>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--color-accent-light)] border-l-4 border-[var(--color-accent)] p-5 rounded-sm">
          <p className="text-body text-[var(--color-text-primary)] mb-2 font-medium">
            No issues published yet.
          </p>
          <p className="text-body text-[var(--color-text-secondary)]">
            Run <code className="bg-[var(--color-surface)] px-2 py-1 rounded text-meta font-mono border border-[var(--color-border)]">npx tsx scripts/buildWeeklyDigest.ts --week=YYYY-W##</code> to create digests.
          </p>
        </div>
      )}
    </div>
  );
}
