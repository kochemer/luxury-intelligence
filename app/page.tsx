import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import DigestClientView from './components/DigestClientView';
import IssueRating from './components/IssueRating';
import CategoryCardGrid from './components/CategoryCardGrid';
import PodcastPlayer from './components/PodcastPlayer';
import StatsBar from './components/StatsBar';
import TopNSelector from './components/TopNSelector';
import BrandPattern from './components/BrandPattern';
import GrainOverlay from './components/GrainOverlay';
import MastheadLockup from './components/MastheadLockup';
import { WeeklyInsight } from './components/WeeklyInsight';
import { EditorSpotlight } from './components/EditorSpotlight';
import { TopicKey } from '@/lib/utils/topicNames';
import { formatDate, formatDateRange, formatDateTime, formatIssueLine } from '@/lib/utils/formatDate';
import { getCurrentDigestWeek } from '@/lib/utils/getCurrentDigestWeek';
import { getSelectedArticleCount, formatStatsSecondaryLine } from '@/lib/utils/digestStats';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';
import { CATEGORY_COLORS } from '@/lib/constants/categoryColors';
import type { WeeklyDigest } from '@/lib/types';

// Get site URL once at module load
const siteUrl = getSiteUrl();

// Runtime assertion in production: ensure canonical URL is correct
if (process.env.NODE_ENV === 'production') {
  const canonical = `${siteUrl}/`;
  if (!canonical.startsWith(siteUrl)) {
    console.error(`[Metadata Error] Homepage canonical URL does not start with siteUrl: ${canonical} (siteUrl: ${siteUrl})`);
  }
  if (!canonical.startsWith('https://')) {
    console.error(`[Metadata Error] Homepage canonical URL is not absolute HTTPS: ${canonical}`);
  }
  if (canonical.includes('vercel.app')) {
    console.error(`[Metadata Error] Homepage canonical URL contains vercel.app domain: ${canonical}`);
  }
}

const HOMEPAGE_TITLE = 'Weekly AI, Ecommerce & Luxury Industry Digest';
const HOMEPAGE_DESCRIPTION = 'A weekly curated digest covering AI & strategy, ecommerce and retail technology, luxury and jewellery industry news. Updated every week.';

// Use generateMetadata (not static metadata) so the OG image points at the
// current week's actual cover image instead of the generic /api/og card.
// Falls back to /api/og when the digest isn't ready (e.g. before first build
// of the week) or the cover image isn't available.
export async function generateMetadata(): Promise<Metadata> {
  const { digest } = await resolveDigest();
  const ogImage = digest?.coverImageUrl
    ? `${siteUrl}${digest.coverImageUrl}`
    : `${siteUrl}/api/og`;
  return {
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESCRIPTION,
    alternates: {
      canonical: `${siteUrl}/`,
    },
    openGraph: {
      title: `${HOMEPAGE_TITLE} | Luxury Intelligence`,
      description: HOMEPAGE_DESCRIPTION,
      images: [ogImage],
    },
    twitter: {
      title: `${HOMEPAGE_TITLE} | Luxury Intelligence`,
      description: HOMEPAGE_DESCRIPTION,
      images: [ogImage],
    },
  };
}

async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch (err: any) {
    // File not found is expected if digest hasn't been generated yet
    if (err?.code === 'ENOENT') {
      // Silently return null - this is expected behavior
      return null;
    }
    // Log other errors (permissions, parse errors, etc.)
    console.error(`Failed to load digest for ${weekLabel}:`, err);
    return null;
  }
}

// The digest week rolls over at Sunday 00:00 local, but the pipeline does not
// commit that week's digest until ~06:25 UTC — and if the weekly run fails, the
// file never lands at all. Without a fallback the homepage renders its empty
// "not built yet" state for those hours every Sunday, and for a whole week
// whenever a run breaks. Fall back to the newest digest already on disk so a
// late or failed build delays the update instead of blanking the front page.
async function findLatestDigestWeek(maxWeek: string): Promise<string | null> {
  try {
    const dir = path.join(process.cwd(), 'data', 'digests');
    const entries = await fs.readdir(dir);
    // Weekly digests only: the directory also holds monthly files (2026-01.json).
    // Labels are zero-padded YYYY-Www, so a lexicographic sort is chronological.
    const weeks = entries
      .filter((f) => /^\d{4}-W\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, -'.json'.length))
      .filter((w) => w <= maxWeek) // never surface a week that hasn't aired yet
      .sort();
    return weeks.length > 0 ? weeks[weeks.length - 1] : null;
  } catch {
    return null;
  }
}

// Returns the digest to render plus the week it actually came from, so the
// issue line, rating widget and digest link all describe the same issue.
async function resolveDigest(): Promise<{ digest: WeeklyDigest | null; weekLabel: string }> {
  const currentWeek = getCurrentDigestWeek();
  const current = await loadDigest(currentWeek);
  if (current) return { digest: current, weekLabel: currentWeek };

  const fallbackWeek = await findLatestDigestWeek(currentWeek);
  if (!fallbackWeek) return { digest: null, weekLabel: currentWeek };

  const fallback = await loadDigest(fallbackWeek);
  return fallback
    ? { digest: fallback, weekLabel: fallbackWeek }
    : { digest: null, weekLabel: currentWeek };
}

type PodcastMetadata = {
  week: string;
  audioPath: string;
  model: string;
  voice: string;
  generatedAt: string;
  duration?: number;
};

async function loadLatestPodcast(): Promise<PodcastMetadata | null> {
  try {
    const weekLabel = getCurrentDigestWeek();
    const podcastPath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'podcast.json');
    const raw = await fs.readFile(podcastPath, 'utf-8');
    return JSON.parse(raw) as PodcastMetadata;
  } catch {
    // Fail silently if podcast doesn't exist
    return null;
  }
}

async function loadPodcastForWeek(weekLabel: string): Promise<PodcastMetadata | null> {
  try {
    const podcastPath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'podcast.json');
    const raw = await fs.readFile(podcastPath, 'utf-8');
    return JSON.parse(raw) as PodcastMetadata;
  } catch {
    // Fail silently if podcast doesn't exist
    return null;
  }
}

// Category UI meta data (title, short desc, topicKey, N)
// Ordered for display: Ecommerce, Jewellery, AI, Luxury
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


export default async function Home() {
  // Use shared utility to get current digest week (synchronized with email digest page)
  const { digest, weekLabel } = await resolveDigest();
  const podcast = await loadPodcastForWeek(weekLabel);

  // HERO section (always present)
  return (
    <main className="w-full" style={{
      minHeight: '100vh',
      fontFamily: 'system-ui, Arial, sans-serif',
      background: 'var(--color-bg)',
    }}>

      {/* MAGAZINE COVER HERO (Concept A) — full-bleed image, overlaid masthead */}
      <section className="relative w-full min-h-[60vh] sm:min-h-[70vh] md:min-h-[80vh] overflow-hidden" style={{ zIndex: 0 }}>
        {/* Cover image — full bleed, anchor to bottom so top crops and bottom is visible */}
        {digest?.coverImageUrl ? (
          /* One optimised image in place of a CSS background plus a duplicate
             sr-only <img>. The background bypassed image optimisation, and
             these covers are ~2.5 MB PNGs — on the homepage that is the
             Largest Contentful Paint element. Same treatment as the digest
             page hero; see app/digest/[slug]/page.tsx. */
          <div className="absolute inset-0 w-full h-full animate-ken-burns">
            <Image
              src={digest.coverImageUrl}
              alt={digest.coverImageAlt || `Weekly digest cover for ${digest?.weekLabel || 'current week'}`}
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
        {/* Dateline stamp — top-left newspaper-style */}
        <div className="hero-dateline absolute top-6 left-6 md:left-12 z-10 font-mono text-[10px] tracking-[0.2em] uppercase text-white/70">
          Published&nbsp;·&nbsp;{digest?.startISO
            ? DateTime.fromISO(digest.startISO).toFormat('dd MMMM yyyy').toUpperCase()
            : DateTime.fromObject({
                weekYear: parseInt(weekLabel.split('-')[0] ?? String(DateTime.now().year), 10),
                weekNumber: parseInt((weekLabel.split('-')[1] ?? 'W1').replace(/^W/i, ''), 10),
              }).toFormat('dd MMMM yyyy').toUpperCase()
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
          {weekLabel && (
            <p
              className="hero-issue text-white/70 text-issue-line tracking-[0.3em] uppercase mt-2"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}
            >
              {formatIssueLine(weekLabel, digest?.startISO)}
            </p>
          )}
        </div>

        {/* Scroll prompt — bottom-right */}
        <div className="hero-scroll-prompt absolute bottom-8 right-8 z-10 font-mono text-[10px] tracking-[0.2em] uppercase text-white/50 flex items-center gap-2 animate-[breathe_3s_ease-in-out_infinite]">
          <span>Scroll to read</span>
          <span className="block w-4 h-px bg-white/50" />
        </div>
      </section>

      {/* PANELS SECTION */}
      <section className="relative z-20 -mt-2 pt-2">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-5 md:px-6">
          {/* Stats bar: article count between hero and category nav */}
          {digest && (
            <StatsBar
              totalArticles={digest.totals.total}
              secondaryLine={formatStatsSecondaryLine(
                digest.totals.total,
                getSelectedArticleCount(digest),
                podcast?.duration != null ? podcast.duration / 60 : undefined
              )}
            />
          )}

          {/* Weekly pull-quote — editorial insight between stats and category nav.
              Insight or nothing: never fall back to an article summary here. */}
          {digest?.oneSentenceSummary && <WeeklyInsight quote={digest.oneSentenceSummary} />}

          {/* Editor's Take — the page's original argument, above the lists (roadmap F3.1) */}
          {digest?.editorialTake && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <EditorSpotlight
                text={digest.editorialTake}
                weekLabel={digest.weekLabel}
                isOverride={Boolean(digest.editorialTakeOverride)}
              />
            </div>
          )}

          {/* Podcast + stats on cream */}
          <div className="bg-[var(--color-bg)] rounded-t-xl md:rounded-t-2xl border border-b-0 border-t border-t-[var(--color-accent)] border-black/5 p-4 sm:p-6 md:p-8 lg:p-10">
          {!digest ? (
            <div style={{
              maxWidth: 520,
              margin: '3.5rem auto 0 auto',
              padding: '2.5rem 1.5rem',
              background: '#fff1e2',
              borderRadius: 10,
              border: '1.5px dashed #ffdfa9',
              fontSize: '1.1rem',
              color: '#913d00',
              textAlign: 'center',
              boxShadow: '0 2px 12px 0 rgba(200,170,100,0.04)'
            }}>
              <h2 style={{margin: '0 0 1rem 0', fontSize: '1.6rem', fontWeight: 600}}>Digest not built yet</h2>
              <p style={{marginBottom:'1.1rem'}}>No latest digest found for this week.</p>
              <div style={{marginBottom:'1.5rem'}}>
                <span style={{
                  background: '#fff4ca',
                  color: '#905e19',
                  fontFamily: 'monospace',
                  padding: '0.28rem 0.46rem',
                  borderRadius: '4px',
                  fontSize: '1.04rem',
                  display:'inline-block'
                }}>npx tsx scripts/buildWeeklyDigest.ts</span>
              </div>
            </div>
          ) : (
            <>
              {/* Podcast Player - At top of panel (cream band) */}
              {podcast && (
                <div className="mb-5 sm:mb-6 md:mb-8 pb-5 sm:pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700">
                  <PodcastPlayer
                    src={podcast.audioPath}
                    title="Weekly Luxury Intelligence · ~12 minutes"
                    description="Listen to this week's key ecommerce, jewellery & luxury stories"
                    durationSeconds={podcast.duration}
                  />
                  <p className="mt-3 text-[11px] tracking-[0.12em] uppercase text-[var(--color-text-secondary)]">
                    Subscribe in your podcast app:{' '}
                    <a href="/podcast/feed.xml" className="underline underline-offset-2 hover:text-[var(--color-accent)]">RSS feed</a>
                  </p>
                </div>
              )}

              {/* THIS WEEK - Category cards + Top N */}
              <div id="categories" className="mb-4 sm:mb-5 md:mb-6 pb-4 sm:pb-5 md:pb-6 border-b border-gray-200 dark:border-gray-700">
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
                    <span className="text-meta font-medium text-black/60">
                      {digest.totals.total}
                    </span>
                    <span className="text-meta text-black/40">
                      articles analysed this week
                    </span>
                  </div>
                </div>
              </div>

              {/* Article sections - white band */}
              <div className={`bg-[var(--color-surface)] border-x border-b border-[var(--color-border)] px-4 sm:px-6 md:px-8 lg:px-10 py-10 sm:py-14 md:py-20 ${!(digest.keyThemes?.length) ? 'rounded-b-xl md:rounded-b-2xl' : ''}`}>
              {/* CATEGORY SECTIONS UI - Client-side rendering with reactive TopN */}
              <Suspense fallback={
                <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {CATEGORY_CARDS.map(cat => (
                    <div key={cat.key} className="w-full">
                      <div className="bg-[var(--color-surface)] dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-4 md:p-7 h-64 animate-pulse" />
                    </div>
                  ))}
                </div>
              }>
                <DigestClientView digest={digest} categoryCards={CATEGORY_CARDS} variant="home" />
              </Suspense>
              </div>

              {/* Key Themes Summary (cream band) */}
              {digest.keyThemes && digest.keyThemes.length > 0 ? (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] rounded-b-xl md:rounded-b-2xl px-4 sm:px-6 md:px-8 lg:px-10 py-8 sm:py-10 md:py-12">
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                    {digest.keyThemes.map((theme, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-meta font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-accent)]/20"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
          </div>

          {/* Issue Rating */}
          {digest && (
            <div className="w-full max-w-5xl mx-auto px-4 py-10 md:py-16 text-center border-t border-[var(--color-border)]">
              <IssueRating slug={weekLabelToSlug(weekLabel)} />
            </div>
          )}

          {/* Permalink to this issue's dedicated page */}
          {digest && (
            <div className="mt-8 mb-2 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
              <Link
                href={`/digest/${weekLabelToSlug(weekLabel)}`}
                className="font-mono text-[11px] tracking-[0.25em] uppercase text-[var(--color-accent)] hover:opacity-70 transition-opacity text-center"
              >
                Read the full {formatDateRange(digest.startISO, digest.endISO)} issue →
              </Link>
              <span className="hidden sm:inline text-[var(--color-border)]">|</span>
              <Link
                href="/archive"
                className="font-mono text-[11px] tracking-[0.25em] uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
              >
                View all issues
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
