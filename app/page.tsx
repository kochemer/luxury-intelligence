import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import DigestClientView from './components/DigestClientView';
import IssueRating from './components/IssueRating';
import WatchOrListen from './components/WatchOrListen';
import FreeSubscribeForm from './components/FreeSubscribeForm';
import { loadWeeklyShort } from '@/lib/video/weeklyShort';
import BrandPattern from './components/BrandPattern';
import MastheadLockup from './components/MastheadLockup';
import { WeeklyInsight } from './components/WeeklyInsight';
import { EditorSpotlight } from './components/EditorSpotlight';
import { TopicKey } from '@/lib/utils/topicNames';
import { formatIssueLine, formatPublishedDate } from '@/lib/utils/formatDate';
import { getCurrentDigestWeek } from '@/lib/utils/getCurrentDigestWeek';
import { formatStatsSecondaryLine } from '@/lib/utils/digestStats';
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
  const short = await loadWeeklyShort(weekLabel);

  const issueHref = `/digest/${weekLabelToSlug(weekLabel)}`;
  const publishedLabel = (digest && formatPublishedDate(digest))
    ?? DateTime.fromObject({
      weekYear: parseInt(weekLabel.split('-')[0] ?? String(DateTime.now().year), 10),
      weekNumber: parseInt((weekLabel.split('-')[1] ?? 'W1').replace(/^W/i, ''), 10),
    }).toFormat('dd MMMM yyyy').toUpperCase();

  // Layout (owner, 2026-10-13 and 2026-10-16): keep the palette, the insight +
  // Spotlight and the two-column article view; one signup form, up front; the
  // weekly cover stays on the page but no longer fills the first screen; the
  // Short and podcast sit beside the Spotlight so they show before the articles.
  return (
    <main className="w-full min-h-screen bg-[var(--color-bg)]">

      {/* MASTHEAD BAND: promise + the one signup form on the left; the weekly cover
          fills the right column edge to edge (top, bottom and right); the
          column is sized from the band height by .home-hero-grid in globals.css
          so the cover stays close to 3:2 at every width. 1024-1279px: the cover
          sits behind the right of the band; tablets: a 16:9 banner above the text;
          phones: native 3:2, uncropped. From 1536px (2xl) the band becomes a
          rounded panel inside the same 100rem column as the content below, so a
          very wide screen has no empty navy strip beside the text (owner, 2026-10-16). */}
      <section className="relative w-full">
        <div className="2xl:max-w-[100rem] 2xl:mx-auto 2xl:px-6 2xl:pt-8">
        <div className="relative overflow-hidden bg-[var(--color-deep)] 2xl:rounded-2xl">
        <BrandPattern variant="dark" className="z-0" />
        <div className="home-hero-grid relative z-10 grid">
          <div className="px-6 py-6 md:px-10 md:py-10 lg:relative lg:z-10 lg:max-w-[33rem] lg:box-content xl:max-w-[36rem] xl:py-10 xl:pr-12 xl:pl-[max(1.5rem,calc((100vw_-_80rem)/2_+_1.5rem))] 2xl:pl-12 xl:self-center">
            <p className="hidden sm:block font-mono text-xs tracking-[0.18em] uppercase text-[var(--color-on-deep-muted)] mb-4">
              Published&nbsp;·&nbsp;{publishedLabel}&nbsp;·&nbsp;Copenhagen
            </p>
            <MastheadLockup variant="hero" />
            <p className="mt-4 text-lg md:text-xl leading-relaxed text-[var(--color-on-deep)] max-w-xl">
              {digest
                ? `The week’s most important stories in ecommerce, AI, luxury and jewellery, ranked from ${digest.totals.total.toLocaleString('en-US')} articles.`
                : 'The week’s most important stories in ecommerce, AI, luxury and jewellery, ranked every Monday.'}
            </p>
            <p className="mt-2 text-issue-line tracking-[0.2em] uppercase text-[var(--color-on-deep-muted)]">
              {formatIssueLine(weekLabel, digest?.startISO)}
            </p>
            <div className="mt-6">
              <FreeSubscribeForm tone="dark" placement="home_hero" />
            </div>
          </div>

          {digest?.coverImageUrl && (
            <Link
              href={issueHref}
              className="order-first lg:order-none group relative block aspect-[3/2] md:aspect-[16/9] lg:absolute lg:inset-y-0 lg:right-0 lg:w-[55%] lg:aspect-auto xl:relative xl:inset-auto xl:w-auto xl:h-full overflow-hidden"
              aria-label={`Open issue ${digest.weekLabel}`}
            >
              <Image
                src={digest.coverImageUrl}
                alt={digest.coverImageAlt || `Cover for ${digest.weekLabel}`}
                fill
                priority
                sizes="(min-width: 1536px) 900px, (min-width: 1280px) 56vw, (min-width: 1024px) 80vw, 100vw"
                // Scene director v9 keeps the subject in the lower half with a calm top third.
                className="object-cover object-[center_65%] transition-transform duration-700 ease-out group-hover:scale-[1.02]"
              />
              {/* Fade the image into the navy on its inner edge so it reads as part of the band */}
              <span className="hidden lg:block absolute inset-y-0 left-0 w-[22%] min-w-32 bg-gradient-to-r from-[var(--color-deep)] via-[var(--color-deep)]/50 to-transparent" aria-hidden="true" />
              <span className="lg:hidden absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--color-deep)] to-transparent" aria-hidden="true" />
            </Link>
          )}
        </div>
        </div>
        </div>
      </section>

      {!digest ? (
        // Reader-facing: never show build commands here (the old block printed
        // `npx tsx scripts/buildWeeklyDigest.ts` to the public).
        <div className="max-w-xl mx-auto my-16 px-6 text-center">
          <h2 className="font-serif text-section text-[var(--color-text-primary)] mb-3">This week&rsquo;s issue is on its way</h2>
          <p className="text-body text-[var(--color-text-secondary)] mb-6">
            A new issue goes out every Monday. Until then, past issues are in the archive.
          </p>
          <Link
            href="/archive"
            className="inline-flex items-center min-h-11 px-5 rounded-sm bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:opacity-90"
          >
            Browse past issues
          </Link>
        </div>
      ) : (
        <div className="w-full max-w-7xl 2xl:max-w-[100rem] mx-auto px-4 sm:px-5 md:px-6">

          {/* READ / WATCH / LISTEN (owner layout, 2026-10-16): the insight as a full-width
              pull quote, then the Spotlight and the Short + podcast side by side, tops aligned.
              DOM order (insight, media, Spotlight) is the phone order, so on phones the media
              comes right after the insight, before the long Spotlight. */}
          <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-x-10 pt-4 md:pt-8">
            {digest.oneSentenceSummary && (
              <div className="lg:col-span-12 lg:row-start-1">
                {/* Insight or nothing: never fall back to an article summary here. */}
                <WeeklyInsight quote={digest.oneSentenceSummary} wide />
              </div>
            )}

            {(short || podcast) && (
              <aside className="lg:col-span-6 lg:col-start-7 xl:col-span-5 xl:col-start-8 2xl:col-span-6 2xl:col-start-7 lg:row-start-2 lg:pt-10 mb-8 lg:mb-0">
                <div className="lg:sticky lg:top-24">
                  <WatchOrListen short={short} podcast={podcast} layout="sidebar" />
                </div>
              </aside>
            )}

            {digest.editorialTake && (
              <div className="lg:col-span-6 xl:col-span-7 2xl:col-span-6 lg:row-start-2">
                <EditorSpotlight
                  text={digest.editorialTake}
                  weekLabel={digest.weekLabel}
                  isOverride={Boolean(digest.editorialTakeOverride)}
                />
              </div>
            )}
          </div>

          {/* TOP STORIES: the two-column category view, three per category; the issue page has all seven */}
          <section aria-labelledby="top-stories" className="mt-8 md:mt-12 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl md:rounded-2xl px-4 sm:px-6 md:px-10 pt-10 md:pt-14 pb-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-2">
              <h2 id="top-stories" className="font-serif text-[1.75rem] md:text-[2.25rem] leading-tight tracking-[-0.02em] text-[var(--color-text-primary)]">
                This week&rsquo;s top stories
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] md:pb-1">
                {formatStatsSecondaryLine(digest)}
              </p>
            </div>
            <Suspense fallback={<div className="h-96" />}>
              <DigestClientView
                digest={digest}
                categoryCards={CATEGORY_CARDS}
                variant="home"
                perCategory={3}
                compact
                moreHref={issueHref}
              />
            </Suspense>
          </section>

          {/* Key themes */}
          {digest.keyThemes && digest.keyThemes.length > 0 && (
            <div className="mt-10 flex flex-wrap gap-2 justify-center">
              {digest.keyThemes.map((theme, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-meta font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-accent)]/20"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}

          {/* Issue rating + links */}
          <div className="py-12 md:py-16 text-center">
            <IssueRating slug={weekLabelToSlug(weekLabel)} />
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 text-sm">
              <Link href={issueHref} className="inline-flex items-center min-h-11 text-[var(--color-accent)] underline underline-offset-4 hover:opacity-80">
                Full issue: all 28 stories
              </Link>
              <Link href="/archive" className="inline-flex items-center min-h-11 text-[var(--color-text-secondary)] underline underline-offset-4 hover:text-[var(--color-accent)]">
                All past issues
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
