import { promises as fs } from 'fs';
import path from 'path';
import Image from 'next/image';
import { Suspense } from 'react';
import DigestClientView from '../components/DigestClientView';
import PodcastPlayer from '../components/PodcastPlayer';
import StatsBar from '../components/StatsBar';
import CategoryCardGrid from '../components/CategoryCardGrid';
import TopNSelector from '../components/TopNSelector';
import BrandPattern from '../components/BrandPattern';
import GrainOverlay from '../components/GrainOverlay';
import MastheadLockup from '../components/MastheadLockup';
import ScrollProgressBar from '../components/ScrollProgressBar';
import { TopicKey } from '@/lib/utils/topicNames';
import { formatDateRange, formatDateTime, formatIssueLine } from '@/lib/utils/formatDate';
import { getCurrentDigestWeek } from '@/lib/utils/getCurrentDigestWeek';
import { getSelectedArticleCount, formatStatsSecondaryLine } from '@/lib/utils/digestStats';
import { getMessages } from '@/lib/i18n/messages';
import { CATEGORY_COLORS } from '@/lib/constants/categoryColors';
import type { WeeklyDigest } from '@/lib/types';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Digest Semanal de IA, Ecommerce y Lujo',
  description: 'Un digest semanal curado sobre IA y estrategia, tecnología de ecommerce y retail, y noticias del sector del lujo y la joyería. Actualizado cada semana.',
  alternates: {
    canonical: `${siteUrl}/es`,
    languages: {
      'en': `${siteUrl}/`,
      'es': `${siteUrl}/es`,
      'da': `${siteUrl}/da`,
      'x-default': `${siteUrl}/`,
    },
  },
  openGraph: {
    title: 'Digest Semanal de IA, Ecommerce y Lujo | Luxury Intelligence',
    description: 'Un digest semanal curado sobre IA y estrategia, tecnología de ecommerce y retail, y noticias del sector del lujo y la joyería.',
    images: [`${siteUrl}/api/og`],
  },
  twitter: {
    title: 'Digest Semanal de IA, Ecommerce y Lujo | Luxury Intelligence',
    description: 'Un digest semanal curado sobre IA y estrategia, tecnología de ecommerce y retail, y noticias del sector del lujo y la joyería.',
    images: [`${siteUrl}/api/og`],
  },
};

type PodcastMetadata = {
  week: string;
  audioPath: string;
  model: string;
  voice: string;
  generatedAt: string;
  duration?: number;
};

async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error(`Failed to load digest for ${weekLabel}:`, err);
    return null;
  }
}

async function loadPodcastForWeek(weekLabel: string): Promise<PodcastMetadata | null> {
  try {
    const podcastPath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'podcast.json');
    const raw = await fs.readFile(podcastPath, 'utf-8');
    return JSON.parse(raw) as PodcastMetadata;
  } catch {
    return null;
  }
}

export default async function HomeES() {
  const weekLabel = getCurrentDigestWeek();
  const digest = await loadDigest(weekLabel);
  const podcast = await loadPodcastForWeek(weekLabel);
  const t = getMessages('es');

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
      title: t.categories.ecommerceRetailTech,
      desc: t.categories.ecommerceRetailTechDesc,
      cardDesc: t.categories.ecommerceRetailTechCardDesc,
      countBy: 'EcommerceRetail',
      topInfo: 'Top 7 artículos por recencia',
      anchorId: 'ecommerce-retail-tech',
    },
    {
      key: 'Jewellery_Industry',
      color: CATEGORY_COLORS.Jewellery_Industry,
      title: t.categories.jewelleryIndustry,
      desc: t.categories.jewelleryIndustryDesc,
      cardDesc: t.categories.jewelleryIndustryCardDesc,
      countBy: 'Jewellery',
      topInfo: 'Top 7 artículos por recencia',
      anchorId: 'jewellery-industry',
    },
    {
      key: 'AI_and_Strategy',
      color: CATEGORY_COLORS.AI_and_Strategy,
      title: t.categories.aiStrategy,
      desc: t.categories.aiStrategyDesc,
      cardDesc: t.categories.aiStrategyCardDesc,
      countBy: 'AIStrategy',
      topInfo: 'Top 7 artículos por relevancia',
      anchorId: 'ai-strategy',
    },
    {
      key: 'Luxury_and_Consumer',
      color: CATEGORY_COLORS.Luxury_and_Consumer,
      title: t.categories.fashionLuxury,
      desc: t.categories.fashionLuxuryDesc,
      cardDesc: t.categories.fashionLuxuryCardDesc,
      countBy: 'LuxuryConsumer',
      topInfo: 'Top 7 artículos por recencia',
      anchorId: 'luxury-consumer',
    },
  ];

  return (
    <main
      className="w-full"
      style={{
        minHeight: '100vh',
        fontFamily: 'system-ui, Arial, sans-serif',
        background: 'var(--color-bg)',
      }}
    >
      {/* MAGAZINE COVER HERO (Concept A) — full-bleed image, overlaid masthead */}
      <section className="relative w-full min-h-[60vh] sm:min-h-[70vh] md:min-h-[80vh] overflow-hidden" style={{ zIndex: 0 }}>
        {digest?.coverImageUrl ? (
          <div className="absolute inset-0 w-full h-full animate-ken-burns">
            <Image
              // Replaces a CSS background plus a duplicate sr-only <img>.
              // Covers are ~2.5 MB PNGs and this is the LCP element.
              src={digest.coverImageUrl}
              alt={digest.coverImageAlt || `Portada del resumen semanal para ${digest?.weekLabel || 'semana actual'}`}
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
        <GrainOverlay id="grain-hero-es" className="z-[2] opacity-[0.08] md:opacity-[0.08] max-md:opacity-[0.03]" />
        <div className="absolute top-0 left-0 right-0 pt-8 md:pt-12 px-6 md:px-12 z-10">
          <div className="reveal">
            <MastheadLockup variant="hero" />
          </div>
          <p className="reveal reveal-d1 text-white/80 text-body mt-2 max-w-xl">
            {t.hero.tagline}
          </p>
          {weekLabel && (
            <p
              className="reveal reveal-d1 text-white/70 text-issue-line tracking-[0.3em] uppercase mt-2"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}
            >
              {formatIssueLine(weekLabel, digest?.startISO)}
            </p>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 z-10">
          {digest?.oneSentenceSummary ? (
            <p className="font-serif italic text-card-title text-white max-w-2xl" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
              {digest.oneSentenceSummary}
            </p>
          ) : null}
        </div>
      </section>

      {/* Scroll progress bar */}
      <ScrollProgressBar />

      {/* PANELS SECTION - same structure as EN */}
      <section className="relative z-20 -mt-2 pt-2">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-5 md:px-6">
          {digest && (
            <StatsBar
              totalArticles={digest.totals.total}
              primaryLabel={t.digest.articlesAnalysedThisWeek}
              secondaryLine={formatStatsSecondaryLine(
                digest.totals.total,
                getSelectedArticleCount(digest),
                podcast?.duration != null ? podcast.duration / 60 : undefined
              )}
            />
          )}
          <div className="bg-[var(--color-bg)] rounded-t-xl md:rounded-t-2xl border border-b-0 border-t border-t-[var(--color-accent)] border-black/5 p-6 sm:p-6 md:p-8 lg:p-10">
            {!digest ? (
              <div
                style={{
                  maxWidth: 520,
                  margin: '3.5rem auto 0 auto',
                  padding: '2.5rem 1.5rem',
                  background: '#fff1e2',
                  borderRadius: 10,
                  border: '1.5px dashed #ffdfa9',
                  fontSize: '1.1rem',
                  color: '#913d00',
                  textAlign: 'center',
                  boxShadow: '0 2px 12px 0 rgba(200,170,100,0.04)',
                }}
              >
                <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.6rem', fontWeight: 600 }}>{t.digest.digestNotBuilt}</h2>
                <p style={{ marginBottom: '1.1rem' }}>{t.digest.noDigestFound}</p>
                <div style={{ marginBottom: '1.5rem' }}>
                  <span
                    style={{
                      background: '#fff4ca',
                      color: '#905e19',
                      fontFamily: 'monospace',
                      padding: '0.28rem 0.46rem',
                      borderRadius: '4px',
                      fontSize: '1.04rem',
                      display: 'inline-block',
                    }}
                  >
                    {t.digest.buildCommand}
                  </span>
                </div>
              </div>
            ) : (
              <>
                {podcast && (
                  <div className="mb-5 sm:mb-6 md:mb-8 pb-5 sm:pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700">
                    <PodcastPlayer
                      src={podcast.audioPath}
                      title={t.podcast.title}
                      description={t.podcast.description}
                      durationSeconds={podcast.duration}
                    />
                  </div>
                )}

                <div className="mb-4 sm:mb-5 md:mb-6 pb-4 sm:pb-5 md:pb-6 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-meta font-medium uppercase tracking-widest text-[var(--color-accent)] block mb-4">
                    {t.digest.thisWeek}
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
                      <span className="text-meta text-black/40">{t.digest.articlesAnalysedThisWeek}</span>
                    </div>
                  </div>
                </div>

                <div
                  className={`bg-[var(--color-surface)] border-x border-b border-gray-200 px-6 sm:px-6 md:px-8 lg:px-10 py-16 md:py-20 ${!(digest.keyThemes?.length) && !digest.oneSentenceSummary ? 'rounded-b-xl md:rounded-b-2xl' : ''}`}
                >
                  <Suspense
                    fallback={
                      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {CATEGORY_CARDS.map((cat) => (
                          <div key={cat.key} className="w-full">
                            <div className="bg-[var(--color-surface)] dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-4 md:p-7 h-64 animate-pulse" />
                          </div>
                        ))}
                      </div>
                    }
                  >
                    <DigestClientView digest={digest} categoryCards={CATEGORY_CARDS} variant="home" locale="es" />
                  </Suspense>
                </div>

                {(digest.keyThemes && digest.keyThemes.length > 0) || digest.oneSentenceSummary ? (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-[var(--color-bg)] rounded-b-xl md:rounded-b-2xl px-6 sm:px-6 md:px-8 lg:px-10 py-16 md:py-20">
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
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
