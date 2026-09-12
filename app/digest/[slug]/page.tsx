import { Suspense } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import Image from 'next/image';
import { DateTime } from 'luxon';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import DigestClientView from '../../components/DigestClientView';
import IssueRating from '../../components/IssueRating';
import CategoryCardGrid from '../../components/CategoryCardGrid';
import PodcastPlayer from '../../components/PodcastPlayer';
import StatsBar from '../../components/StatsBar';
import BrandPattern from '../../components/BrandPattern';
import GrainOverlay from '../../components/GrainOverlay';
import MastheadLockup from '../../components/MastheadLockup';
import { WeeklyInsight } from '../../components/WeeklyInsight';
import { EditorSpotlight } from '../../components/EditorSpotlight';
import AnalyticsDigestView from '../../components/AnalyticsDigestView';
import TopNSelector from '../../components/TopNSelector';
import ScrollProgressBar from '../../components/ScrollProgressBar';
import JsonLd from '../../components/JsonLd';
import Breadcrumbs from '../../components/Breadcrumbs';
import { getTopicTotalsDisplayName, TopicKey } from '@/lib/utils/topicNames';
import { formatDateRange, formatDateTime, formatIssueLine } from '@/lib/utils/formatDate';
import { getSelectedArticleCount, formatStatsSecondaryLine } from '@/lib/utils/digestStats';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { weekLabelToSlug, slugToWeekLabel } from '@/lib/utils/weekSlug';
import { CATEGORY_COLORS } from '@/lib/constants/categoryColors';
import { buildWeekTitle, buildWeekMetaDescription } from '@/lib/seo/metaText';
import { buildNewsArticleLd, buildDigestItemListLd, buildBreadcrumbLd } from '@/lib/seo/jsonLd';
import type { WeeklyDigest } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug }      = await params;
  const weekLabel     = slugToWeekLabel(slug);
  const siteUrl       = getSiteUrl();

  if (!weekLabel) {
    return { title: 'Digest Not Found' };
  }

  const digest  = await loadDigest(weekLabel);
  // Prefer the AI-generated cover; fall back to the branded dynamic OG card
  const ogImage = digest?.coverImageUrl
    ? `${siteUrl}${digest.coverImageUrl}`
    : `${siteUrl}/api/og?week=${encodeURIComponent(weekLabel)}`;

  const dateRange   = digest ? formatDateRange(digest.startISO, digest.endISO) : slug;
  const title       = buildWeekTitle(dateRange);
  const description = digest
    ? buildWeekMetaDescription(digest, dateRange)
    : `Curated intelligence for ${weekLabel} — AI, ecommerce, luxury and jewellery industry news with AI-assisted summaries.`;

  return {
    // `absolute` bypasses the root layout's "%s | Luxury Intelligence"
    // template. buildWeekTitle already ends with the publication name, so
    // letting the template run appended it twice and pushed every digest
    // title past 80 characters — well beyond where Google truncates.
    title: { absolute: title },
    description,
    alternates: {
      canonical: `${siteUrl}/digest/${slug}`,
    },
    openGraph: {
      title,
      description,
      images: [ogImage],
    },
    twitter: {
      title,
      description,
      images: [ogImage],
    },
  };
}

export async function generateStaticParams() {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files = await fs.readdir(digestsDir);
    return files
      .filter(file => /^\d{4}-W\d{1,2}\.json$/.test(file))
      .map(file => ({ slug: weekLabelToSlug(file.replace('.json', '')) }));
  } catch {
    return [];
  }
}

async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  // Defense-in-depth: ensure weekLabel is strictly YYYY-Www before building the path.
  // slugToWeekLabel already validates this, but we guard here too in case the
  // function is called from other callers in future.
  if (!/^\d{4}-W\d{1,2}$/.test(weekLabel)) return null;

  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch {
    return null;
  }
}

async function getAvailableWeeks(): Promise<string[]> {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files      = await fs.readdir(digestsDir);
    return files
      .filter(file => /^(\d{4})-W(\d{1,2})\.json$/.test(file))
      .map(file => file.replace('.json', ''))
      .sort((a, b) => {
        const [yearA, weekA] = a.split('-W').map(Number);
        const [yearB, weekB] = b.split('-W').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return weekA - weekB;
      });
  } catch (err) {
    console.error('[Digest Navigation] Error getting available weeks:', err);
    return [];
  }
}

async function getWeekNavigation(weekLabel: string): Promise<{
  previousWeek: string | null;
  nextWeek: string | null;
}> {
  try {
    const availableWeeks = await getAvailableWeeks();
    const currentIndex   = availableWeeks.indexOf(weekLabel);
    if (currentIndex === -1) return { previousWeek: null, nextWeek: null };
    return {
      previousWeek: currentIndex > 0 ? availableWeeks[currentIndex - 1]! : null,
      nextWeek: currentIndex < availableWeeks.length - 1 ? availableWeeks[currentIndex + 1]! : null,
    };
  } catch (err) {
    console.error('[Digest Navigation] Error getting week navigation:', err);
    return { previousWeek: null, nextWeek: null };
  }
}

export default async function DigestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug }  = await params;
  const weekLabel = slugToWeekLabel(slug);

  if (!weekLabel) notFound();

  // Canonical redirect: if the slug doesn't match the current canonical form
  // (e.g. old "december-2026-week-1" → new "january-2026-week-1"), 308 to fix it.
  const canonicalSlug = weekLabelToSlug(weekLabel);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/digest/${canonicalSlug}`);
  }

  const digest = await loadDigest(weekLabel);
  const { previousWeek, nextWeek } = await getWeekNavigation(weekLabel);

  // Load adjacent digests to get human-readable date ranges for nav labels
  const [prevDigest, nextDigest] = await Promise.all([
    previousWeek ? loadDigest(previousWeek) : Promise.resolve(null),
    nextWeek     ? loadDigest(nextWeek)     : Promise.resolve(null),
  ]);
  const prevLabel = prevDigest
    ? formatDateRange(prevDigest.startISO, prevDigest.endISO)
    : previousWeek ?? '';
  const nextLabel = nextDigest
    ? formatDateRange(nextDigest.startISO, nextDigest.endISO)
    : nextWeek ?? '';

  type PodcastMetadata = {
    week: string;
    audioPath: string;
    model: string;
    voice: string;
    generatedAt: string;
    duration?: number;
  };

  let podcast: PodcastMetadata | null = null;
  try {
    const podcastPath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'podcast.json');
    const raw = await fs.readFile(podcastPath, 'utf-8');
    podcast = JSON.parse(raw) as PodcastMetadata;
  } catch {
    // Podcast doesn't exist for this week
  }

  if (!digest) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <h1 className="text-page-h1 font-bold mb-4 text-gray-900">Digest Not Found</h1>
        <p className="text-body text-gray-600 mb-4">
          The digest for {weekLabel} has not been built yet.
        </p>
        <p className="text-body text-gray-600 mb-8">
          Run: <code className="bg-gray-100 px-2 py-1 rounded text-meta font-mono">npx tsx scripts/buildWeeklyDigest.ts --week={weekLabel}</code>
        </p>
        <div className="flex gap-4">
          <Link href="/archive" className="text-blue-600 hover:text-blue-800 underline">← Archive</Link>
          <Link href="/" className="text-blue-600 hover:text-blue-800 underline">Home</Link>
        </div>
      </div>
    );
  }

  const dateRange = formatDateRange(digest.startISO, digest.endISO);
  const siteUrl   = getSiteUrl();

  const pageUrl = `${siteUrl}/digest/${slug}`;

  // Publisher and author are referenced by @id rather than re-declared here —
  // they are defined once in the root graph (app/layout.tsx via
  // lib/seo/jsonLd.ts), so the article's publisher resolves to the same
  // organisation that owns the site instead of an anonymous duplicate.
  const newsArticleSchema = buildNewsArticleLd({
    siteUrl,
    url: pageUrl,
    headline: buildWeekTitle(dateRange),
    description: digest.oneSentenceSummary
      ?? `Weekly curated digest: ${digest.totals.total} articles across AI, ecommerce, jewellery, and luxury.`,
    digest,
    imageUrl: digest.coverImageUrl ? `${siteUrl}${digest.coverImageUrl}` : undefined,
  });

  // The week's curated selection, expressed as data rather than only prose.
  const itemListSchema = buildDigestItemListLd({ siteUrl, url: pageUrl, dateRange, digest });

  const breadcrumbSchema = buildBreadcrumbLd({
    siteUrl,
    items: [
      { name: 'Home', url: `${siteUrl}/` },
      { name: 'Archive', url: `${siteUrl}/archive` },
      { name: dateRange, url: pageUrl },
    ],
  });

  const CATEGORY_CARDS: Array<{
    key: TopicKey;
    color: string;
    title: string;
    desc: string;
    cardDesc: string;
    countBy: string;
    topInfo: string;
    anchorId: string;
  }> = [
    {
      key: 'Ecommerce_Retail_Tech',
      color: CATEGORY_COLORS.Ecommerce_Retail_Tech,
      title: 'Ecommerce & Retail Tech',
      desc: 'Breakthroughs and trends shaping online commerce, retail, and emerging tech.',
      cardDesc: 'Digital commerce, retail innovation, DTC trends',
      countBy: 'EcommerceRetail',
      topInfo: 'Top 7 articles by recency',
      anchorId: 'ecommerce-retail-tech',
    },
    {
      key: 'Jewellery_Industry',
      color: CATEGORY_COLORS.Jewellery_Industry,
      title: 'Jewellery Industry',
      desc: 'Key updates and articles across jewellery brands, trade, and supply chain.',
      cardDesc: 'Market moves, brand strategy, trade insights',
      countBy: 'Jewellery',
      topInfo: 'Top 7 articles by recency',
      anchorId: 'jewellery-industry',
    },
    {
      key: 'AI_and_Strategy',
      color: CATEGORY_COLORS.AI_and_Strategy,
      title: 'Artificial Intelligence News',
      desc: 'The latest advances and strategies in artificial intelligence and business transformation.',
      cardDesc: 'AI news, strategy, and business transformation',
      countBy: 'AIStrategy',
      topInfo: 'Top 7 articles by relevance',
      anchorId: 'ai-strategy',
    },
    {
      key: 'Luxury_and_Consumer',
      color: CATEGORY_COLORS.Luxury_and_Consumer,
      title: 'Fashion & Luxury',
      desc: 'Innovations and changes in luxury and wider consumer products, experiences, and brands.',
      cardDesc: 'Luxury brands, consumer trends, fashion',
      countBy: 'LuxuryConsumer',
      topInfo: 'Top 7 articles by recency',
      anchorId: 'luxury-consumer',
    },
  ];

  return (
    <>
      <JsonLd data={newsArticleSchema} />
      <JsonLd data={itemListSchema} />
      <JsonLd data={breadcrumbSchema} />
      <main className="w-full" style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>

        {/* MAGAZINE COVER HERO — matches homepage style */}
        <section className="relative w-full min-h-[60vh] sm:min-h-[70vh] md:min-h-[80vh] overflow-hidden" style={{ zIndex: 0 }}>
          {digest.coverImageUrl ? (
            /* One optimised image, where there used to be a CSS background
               plus a duplicate sr-only <img>. The background bypassed every
               image optimisation — these covers are ~2.5 MB PNGs and this is
               the Largest Contentful Paint element on the page. next/image
               serves WebP/AVIF at the viewport's actual size; `priority`
               keeps it eager, which is correct for a hero. The alt text now
               lives on the visible image rather than a hidden twin. */
            <div className="absolute inset-0 w-full h-full animate-ken-burns">
              <Image
                src={digest.coverImageUrl}
                alt={digest.coverImageAlt || `Weekly digest cover for ${digest.weekLabel}`}
                fill
                priority
                sizes="100vw"
                className="object-cover object-bottom"
              />
            </div>
          ) : (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ background: 'linear-gradient(120deg, var(--color-deep) 50%, var(--color-accent) 100%)' }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/50" />
          <BrandPattern variant="dark" className="z-[1]" />
          <GrainOverlay id="grain-hero" className="z-[2] opacity-[0.08] md:opacity-[0.08] max-md:opacity-[0.03]" />

          {/* Dateline stamp — top-left */}
          <div className="hero-dateline absolute top-6 left-6 md:left-12 z-10 font-mono text-[10px] tracking-[0.2em] uppercase text-white/70">
            Published&nbsp;·&nbsp;{digest.startISO
              ? DateTime.fromISO(digest.startISO).toFormat('dd MMMM yyyy').toUpperCase()
              : dateRange.toUpperCase()
            }&nbsp;·&nbsp;Copenhagen
          </div>

          {/* Masthead */}
          <div className="absolute top-0 left-0 right-0 pt-8 md:pt-12 px-6 md:px-12 z-10">
            <div className="hero-title">
              <MastheadLockup variant="hero" />
            </div>
            <p className="hero-sub font-mono text-white/80 text-body mt-2 max-w-xl uppercase">
              Weekly intelligence across AI, ecommerce, luxury, and jewellery.
            </p>
            {digest.weekLabel && (
              <p
                className="hero-issue text-white/70 text-issue-line tracking-[0.3em] uppercase mt-2"
                style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}
              >
                {formatIssueLine(digest.weekLabel, digest.startISO)}
              </p>
            )}
          </div>

          {/* Scroll prompt — bottom-right */}
          <div className="hero-scroll-prompt absolute bottom-8 right-8 z-10 font-mono text-[10px] tracking-[0.2em] uppercase text-white/50 flex items-center gap-2 animate-[breathe_3s_ease-in-out_infinite]">
            <span>Scroll to read</span>
            <span className="block w-4 h-px bg-white/50" />
          </div>
        </section>

        <ScrollProgressBar />

        {/* PANELS SECTION */}
        <section className="relative z-20 -mt-2 pt-2">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-5 md:px-6">
            <div className="mb-4 sm:mb-5 md:mb-6 mt-2">
              <Breadcrumbs
                items={[
                  { label: 'Home',    href: '/' },
                  { label: 'Archive', href: '/archive' },
                  { label: dateRange },
                ]}
              />
            </div>

            <StatsBar
              totalArticles={digest.totals.total}
              secondaryLine={formatStatsSecondaryLine(
                digest.totals.total,
                getSelectedArticleCount(digest),
                podcast?.duration != null ? podcast.duration / 60 : undefined,
              )}
            />

            {(() => {
              const quote =
                digest.weeklyInsight ||
                digest.oneSentenceSummary ||
                digest.introParagraph ||
                digest.topics?.AI_and_Strategy?.top?.[0]?.aiSummary ||
                digest.topics?.Ecommerce_Retail_Tech?.top?.[0]?.aiSummary ||
                null;
              return quote ? <WeeklyInsight quote={quote} /> : null;
            })()}

            {/* EditorSpotlight hidden on archived pages for now */}

            <div className="bg-[var(--color-bg)] rounded-t-xl md:rounded-t-2xl border border-b-0 border-t border-t-[var(--color-accent)] border-black/5 p-4 sm:p-6 md:p-8 lg:p-10">
              {podcast && (
                <div className="mb-5 sm:mb-6 md:mb-8 pb-5 sm:pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700">
                  <PodcastPlayer
                    src={podcast.audioPath}
                    title="Weekly Luxury Intelligence · ~12 minutes"
                    description="Listen to this week's key ecommerce, jewellery & luxury stories"
                    durationSeconds={podcast.duration}
                  />
                </div>
              )}

              <div className="mb-4 sm:mb-5 md:mb-6 pb-4 sm:pb-5 md:pb-6 border-b border-gray-200 dark:border-gray-700">
                <span className="text-meta font-medium uppercase tracking-widest text-[var(--color-accent)] block mb-4">
                  THIS WEEK
                </span>
                <CategoryCardGrid
                  cards={CATEGORY_CARDS.map((cat) => {
                    const byTopic = digest.totals?.byTopic as Record<string, number> | undefined;
                    return {
                      key: cat.key,
                      title: cat.title,
                      cardDesc: cat.cardDesc,
                      color: cat.color,
                      anchorId: cat.anchorId,
                      count: byTopic?.[cat.countBy] ?? 0,
                    };
                  })}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center">
                    <Suspense fallback={<div className="h-4 w-20" />}>
                      <TopNSelector />
                    </Suspense>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-meta font-medium text-black/60">{digest.totals.total}</span>
                    <span className="text-meta text-black/40">articles analysed this week</span>
                  </div>
                </div>
              </div>

              <Suspense fallback={
                <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {CATEGORY_CARDS.map(cat => (
                    <div key={cat.key} className="w-full">
                      <div className="bg-[var(--color-surface)] dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-4 md:p-7 h-64 animate-pulse" />
                    </div>
                  ))}
                </div>
              }>
                <AnalyticsDigestView weekLabel={weekLabel} />
                <DigestClientView digest={digest} categoryCards={CATEGORY_CARDS} variant="home" />
              </Suspense>

              {(digest.keyThemes && digest.keyThemes.length > 0) || digest.oneSentenceSummary ? (
                <div className="mt-6 sm:mt-8 md:mt-10 pt-4 sm:pt-6 md:pt-8 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-center">
                    {digest.oneSentenceSummary && (
                      <p className="text-body text-gray-700 dark:text-gray-300 mb-3 sm:mb-4 px-2">
                        {digest.oneSentenceSummary}
                      </p>
                    )}
                    {digest.keyThemes && digest.keyThemes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                        {digest.keyThemes.map((theme, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-meta font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Issue Rating */}
              <div className="w-full max-w-5xl mx-auto px-4 py-10 md:py-16 text-center border-t border-[var(--color-border)]">
                <IssueRating slug={slug} />
              </div>

              {/* Issue Navigation */}
              <nav
                aria-label="Issue navigation"
                className="mt-6 sm:mt-8 md:mt-10 pt-4 sm:pt-6 md:pt-8 border-t border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Previous issue */}
                  {previousWeek ? (
                    <Link
                      href={`/digest/${weekLabelToSlug(previousWeek)}`}
                      className="group flex flex-col gap-0.5 max-w-[40%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] rounded px-1 py-1"
                    >
                      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] transition-colors">
                        ← Previous Issue
                      </span>
                      <span className="font-serif text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors leading-snug">
                        {prevLabel}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex-1" />
                  )}

                  {/* Archive link — centred */}
                  <Link
                    href="/archive"
                    className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-accent)] hover:opacity-70 transition-opacity whitespace-nowrap self-center px-2"
                  >
                    View all issues
                  </Link>

                  {/* Next issue */}
                  {nextWeek ? (
                    <Link
                      href={`/digest/${weekLabelToSlug(nextWeek)}`}
                      className="group flex flex-col items-end gap-0.5 max-w-[40%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] rounded px-1 py-1"
                    >
                      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] transition-colors">
                        Next Issue →
                      </span>
                      <span className="font-serif text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors leading-snug text-right">
                        {nextLabel}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
              </nav>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
