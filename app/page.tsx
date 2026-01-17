import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import DigestClientView from './components/DigestClientView';
import TopNSelector from './components/TopNSelector';
import { TopicKey } from '../utils/topicNames';
import { formatDate, formatDateRange, formatDateTime } from '../utils/formatDate';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app";

export const metadata: Metadata = {
  title: 'Weekly AI, Ecommerce & Luxury Industry Digest',
  description: 'A weekly curated digest covering AI & strategy, ecommerce and retail technology, luxury and jewellery industry news. Updated every week.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Weekly AI, Ecommerce & Luxury Industry Digest',
    description: 'A weekly curated digest covering AI & strategy, ecommerce and retail technology, luxury and jewellery industry news. Updated every week.',
    images: [`${siteUrl}/og-default.svg`],
  },
  twitter: {
    title: 'Weekly AI, Ecommerce & Luxury Industry Digest',
    description: 'A weekly curated digest covering AI & strategy, ecommerce and retail technology, luxury and jewellery industry news. Updated every week.',
    images: [`${siteUrl}/og-default.svg`],
  },
};

type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
  aiSummary?: string | null;
};

type WeeklyDigest = {
  weekLabel: string;
  tz: string;
  startISO: string;
  endISO: string;
  builtAtISO?: string;
  builtAtLocal?: string;
  coverImageUrl?: string;
  coverImageAlt?: string;
  coverKeywords?: string[];
  keyThemes?: string[];
  oneSentenceSummary?: string;
  introParagraph?: string;
  totals: {
    total: number;
    byTopic: {
      AIStrategy: number;
      EcommerceRetail: number;
      LuxuryConsumer: number;
      Jewellery: number;
    };
  };
  topics: {
    AI_and_Strategy: { total: number; top: Article[] };
    Ecommerce_Retail_Tech: { total: number; top: Article[] };
    Luxury_and_Consumer: { total: number; top: Article[] };
    Jewellery_Industry: { total: number; top: Article[] };
  };
};

function getCurrentWeek(): string {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const year = now.year;
  const weekNumber = now.weekNumber;
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

function getPreviousWeek(): string {
  const now = DateTime.now().setZone('Europe/Copenhagen');
  const previousWeek = now.minus({ weeks: 1 });
  const year = previousWeek.year;
  const weekNumber = previousWeek.weekNumber;
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}


async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch (err) {
    console.error(`Failed to load digest for ${weekLabel}:`, err);
    return null;
  }
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
    const weekLabel = getPreviousWeek();
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
  countBy: string;
  topInfo: string;
  anchorId: string;
}> = [
  {
    key: 'Ecommerce_Retail_Tech',
    color: '#264653',
    title: 'Ecommerce & Retail Tech',
    desc: 'Breakthroughs and trends shaping online commerce, retail, and emerging tech.',
    countBy: 'EcommerceRetail',
    topInfo: 'Top 7 articles by recency',
    anchorId: 'ecommerce-retail-tech',
  },
  {
    key: 'Jewellery_Industry',
    color: '#be8b36',
    title: 'Jewellery Industry',
    desc: 'Key updates and articles across jewellery brands, trade, and supply chain.',
    countBy: 'Jewellery',
    topInfo: 'Top 7 articles by recency',
    anchorId: 'jewellery-industry',
  },
  {
    key: 'AI_and_Strategy',
    color: '#25505f',
    title: 'Artificial Intelligence News',
    desc: 'The latest advances and strategies in artificial intelligence and business transformation.',
    countBy: 'AIStrategy',
    topInfo: 'Top 7 articles by relevance',
    anchorId: 'ai-strategy',
  },
  {
    key: 'Luxury_and_Consumer',
    color: '#6b2d5c',
    title: 'Fashion & Luxury',
    desc: 'Innovations and changes in luxury and wider consumer products, experiences, and brands.',
    countBy: 'LuxuryConsumer',
    topInfo: 'Top 7 articles by recency',
    anchorId: 'luxury-consumer',
  },
];


export default async function Home() {
  const weekLabel = getPreviousWeek();
  const digest = await loadDigest(weekLabel);
  const podcast = await loadLatestPodcast();

  // HERO section (always present)
  return (
    <main className="w-full" style={{
      minHeight: '100vh',
      fontFamily: 'system-ui, Arial, sans-serif',
      background: '#f7f9fb',
    }}>

      {/* HERO */}
      <section className="mb-6" style={{
        position: 'relative',
        width: '100%',
        minHeight: 180,
        background: 'linear-gradient(120deg,#6b2d5c 50%, #8b4a7a 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderBottom: '1px solid #e5e7eb'
      }}>
        {/* Temporarily commented out - image file missing
        <div style={{
          position: 'absolute',
          zIndex: 0,
          top: 0, left: 0, width: '100%', height: '100%',
        }}>
            <Image
              src="/hero-digest.jpg"
              alt="Weekly Digest Hero"
              priority
              fill
              style={{ objectFit: 'cover', objectPosition: 'center center', filter: 'brightness(0.75) blur(0.3px)', opacity: 0.4 }}
            />
        </div>
        */}
        {/* Logo - Top Left */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          padding: '1rem 0.5rem 1rem 0'
        }}>
          <img
            src="/favicon.png"
            alt="Luxury Intelligence"
            style={{
              height: '119%',
              width: 'auto',
              display: 'block',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
              objectFit: 'contain'
            }}
          />
        </div>
        <div className="w-full max-w-[1400px] lg:max-w-[1600px] 2xl:max-w-[1800px] mx-auto px-4 md:px-8" style={{
          position: 'relative',
          zIndex: 2,
          color: '#fff',
          padding: '2rem 1.5rem 1.75rem 1.5rem',
          textAlign: 'center',
        }}>
          <h1 className="text-4xl md:text-5xl font-bold mb-3" style={{
            textShadow: '0 1px 4px rgba(18,30,49,0.15)'
          }}>
            Luxury Intelligence
          </h1>
          <div className="text-base md:text-lg text-gray-100 leading-relaxed max-w-xl mx-auto mb-3">
            Weekly intelligence across AI, ecommerce, luxury, and jewellery.
          </div>
          <p className="text-sm md:text-base text-gray-300 mb-5">
            Curated articles, signals, and context — handpicked and summarised by AI agents each week.
          </p>
        </div>
      </section>

      {/* If digest missing, show clear notice */}
      {!digest ? (
        <section style={{
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
        </section>
      ) : (
      <>
        {/* This Week's Cover */}
        {digest.coverImageUrl && (
          <section className="w-full max-w-[1404px] lg:max-w-[1638px] 2xl:max-w-[1825px] mx-auto px-4 md:px-8 mb-4 md:mb-5">
            <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3 md:mb-4">
                <h3 className="text-base md:text-lg font-semibold text-gray-900">
                  This week&apos;s cover
                </h3>
                <div className="flex items-center gap-3 flex-wrap text-xs md:text-sm text-gray-600">
                  <span>
                    {formatDateRange(digest.startISO, digest.endISO)}
                    {digest.builtAtISO && (
                      <span className="ml-4">• Built {formatDateTime(digest.builtAtISO)}</span>
                    )}
                  </span>
                </div>
              </div>
              <div className="relative w-full rounded-lg overflow-hidden" style={{ height: '432px' }}>
                <img
                  src={digest.coverImageUrl}
                  alt={digest.coverImageAlt || `Weekly digest cover for ${digest.weekLabel}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-black bg-opacity-50 px-6 md:px-8 py-3 md:py-4 rounded-lg">
                    <h2 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      Week {digest.weekLabel}
                    </h2>
                  </div>
                </div>
              </div>
              
              {/* Weekly Podcast Player - Inside same pane */}
              {podcast && (
                <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-gray-200">
                  <div className="mb-3">
                    <h3 className="text-base md:text-lg font-semibold text-gray-900">
                      🎧 Weekly Luxury Intelligence Podcast · ~20 min
                    </h3>
                    <p className="text-sm text-gray-600 italic mt-2">
                      Listen to this week&apos;s key ecommerce, jewellery & luxury stories
                    </p>
                  </div>
                  <audio
                    controls
                    preload="none"
                    className="w-full"
                    style={{
                      height: '48px',
                      borderRadius: '6px',
                    }}
                  >
                    <source src={podcast.audioPath} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Category Jump Navigation */}
        <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-4 md:mb-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-between w-full flex-wrap gap-4">
              <nav className="flex flex-wrap gap-2 justify-center flex-1" aria-label="Category navigation">
                {CATEGORY_CARDS.map(cat => (
                  <a
                    key={cat.anchorId}
                    href={`#${cat.anchorId}`}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 bg-gray-50 text-gray-700 rounded-full hover:bg-gray-100 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                  >
                    {cat.title}
                  </a>
                ))}
              </nav>
              <div className="text-right">
                <p className="text-sm md:text-base text-gray-500 whitespace-nowrap">
                  {digest.totals.total} articles processed this week
                </p>
              </div>
            </div>
            <div className="flex justify-center">
              <Suspense fallback={<div className="h-6 w-20" />}>
                <TopNSelector />
              </Suspense>
            </div>
          </div>
        </section>

        {/* CATEGORY SECTIONS UI - Client-side rendering with reactive TopN */}
        <Suspense fallback={
          <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-16 md:mb-20">
            <div className="w-full grid grid-cols-12 gap-8 lg:gap-10">
              {CATEGORY_CARDS.map(cat => (
                <div key={cat.key} className="col-span-12 lg:col-span-6 w-full">
                  <div className="bg-white rounded-lg border border-gray-100 p-4 md:p-7 h-64 animate-pulse" />
                </div>
              ))}
            </div>
          </section>
        }>
          <DigestClientView digest={digest} categoryCards={CATEGORY_CARDS} variant="home" />
        </Suspense>

        {/* Key Themes Summary (Home Page) */}
        {(digest.keyThemes && digest.keyThemes.length > 0) || digest.oneSentenceSummary ? (
          <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-4 md:mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
              <div className="text-center">
                {digest.oneSentenceSummary && (
                  <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
                    {digest.oneSentenceSummary}
                  </p>
                )}
                {digest.keyThemes && digest.keyThemes.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {digest.keyThemes.map((theme, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </>
      )}
    </main>
  );
}
