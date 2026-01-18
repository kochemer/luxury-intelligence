import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
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
  // Show week 3 (2026-W03) - update this to getPreviousWeek() or getLatestAvailableDigest() for production
  const weekLabel = '2026-W03';
  const digest = await loadDigest(weekLabel);
  const podcast = await loadPodcastForWeek(weekLabel);

  // HERO section (always present)
  return (
    <main className="w-full" style={{
      minHeight: '100vh',
      fontFamily: 'system-ui, Arial, sans-serif',
      background: '#f7f9fb',
    }}>

      {/* STICKY FULL-SCREEN HERO */}
      <section className="relative h-[100svh]" style={{ zIndex: 0 }}>
        {/* Sticky layer */}
        <div className="sticky top-0 h-[100svh] overflow-hidden">
          {/* Cover image or gradient background */}
          {digest?.coverImageUrl ? (
            <img
              src={digest.coverImageUrl}
              alt={digest.coverImageAlt || `Weekly digest cover for ${digest?.weekLabel || 'current week'}`}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div 
              className="absolute inset-0 w-full h-full"
              style={{
                background: 'linear-gradient(120deg,#6b2d5c 50%, #8b4a7a 100%)',
              }}
            />
          )}
          
          {/* Gradient overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-black/0" />
          
          {/* "This week's cover" label - top left */}
          {digest?.coverImageUrl && (
            <div className="absolute top-6 left-6 z-20">
              <p className="text-sm md:text-base text-white font-medium" style={{
                textShadow: '0 1px 3px rgba(0,0,0,0.5)'
              }}>
                This week&apos;s cover
              </p>
            </div>
          )}
          
          {/* Hero content */}
          <div className="relative z-10 h-full flex items-center justify-center">
            <div className="w-full max-w-[1400px] lg:max-w-[1600px] 2xl:max-w-[1800px] mx-auto px-4 md:px-8 text-center">
              <div className="bg-black/20 backdrop-blur-sm rounded-2xl px-6 md:px-10 py-8 md:py-12 inline-block">
                <h1 className="font-bold mb-4 text-[4rem] md:text-[5.5rem] lg:text-[6.5rem] text-white" style={{
                  textShadow: '0 2px 8px rgba(0,0,0,0.5)'
                }}>
                  Luxury Intelligence
                </h1>
                <div className="text-gray-100 leading-relaxed max-w-5xl mx-auto mb-4 text-[1.6rem] md:text-[2rem] lg:text-[2.2rem] whitespace-nowrap" style={{
                  textShadow: '0 1px 4px rgba(0,0,0,0.3)'
                }}>
                  Weekly intelligence across AI, ecommerce, luxury, and jewellery.
                </div>
                <p className="text-gray-200 mb-6 text-[1.2rem] md:text-[1.5rem] lg:text-[1.6rem] italic" style={{
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }}>
                  Curated articles, signals, and context — handpicked and summarised by AI agents each week.
                </p>
                {digest?.weekLabel && (
                  <div className="mt-8">
                    <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      Week {digest.weekLabel}
                    </h2>
                  </div>
                )}
              </div>
            </div>
            
            {/* Scroll indicator - inside hero content area */}
            <div 
              className="absolute bottom-32 left-1/2 pointer-events-none"
              style={{
                transform: 'translateX(-50%)',
                zIndex: 50,
                animation: 'scrollIndicator 2s ease-in-out infinite'
              }}
            >
              <div className="rounded-full px-6 py-5 bg-black/30 backdrop-blur-md shadow-lg border border-white/10">
                <svg 
                  className="w-10 h-10 text-white opacity-80" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  {/* First chevron */}
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2.5} 
                    d="M19 9l-7 7-7-7" 
                  />
                  {/* Second chevron (shifted down) */}
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2.5} 
                    d="M19 15l-7 7-7-7" 
                  />
                </svg>
              </div>
            </div>
          </div>
          
          {/* Date range and build info - bottom right */}
          {digest && (
            <div className="absolute bottom-4 right-4 z-20">
              <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
                <div className="text-xs md:text-sm text-white" style={{
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                }}>
                  <span>
                    {formatDateRange(digest.startISO, digest.endISO)}
                    {digest.builtAtISO && (
                      <span className="ml-2">• Built {formatDateTime(digest.builtAtISO)}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* PANELS SECTION - Overtaking Content */}
      <section className="relative z-20 -mt-16 md:-mt-24">
        {/* Panel Container */}
        <div className="w-full max-w-[1400px] lg:max-w-[1600px] 2xl:max-w-[1800px] mx-auto px-4 md:px-8">
          <div className="bg-white/95 dark:bg-zinc-950/90 backdrop-blur rounded-2xl shadow-lg border border-black/5 dark:border-white/10 p-6 md:p-10">
          {/* If digest missing, show clear notice */}
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
              {/* Podcast Player - At top of panel */}
              {podcast && (
                <div className="mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700">
                  <div className="mb-3">
                    <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100">
                      🎧 Weekly Luxury Intelligence Podcast · ~12 minutes
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 italic mt-2">
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

              {/* Category Control Bar - Editorial style */}
              <div className="mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700">
                <div className="rounded-2xl border border-black/5 bg-white/70 backdrop-blur-sm px-6 py-4">
                  <div className="flex items-center justify-between gap-6 flex-wrap">
                    {/* Left: Category Pills (Primary) */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <span className="text-[11px] uppercase tracking-wider text-black/40 whitespace-nowrap">
                        Browse by category
                      </span>
                      <nav className="flex flex-wrap gap-2" aria-label="Category navigation">
                        {CATEGORY_CARDS.map(cat => (
                          <a
                            key={cat.anchorId}
                            href={`#${cat.anchorId}`}
                            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/[0.02] hover:border-black/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20 focus-visible:ring-offset-1 transition-colors"
                          >
                            {cat.title}
                          </a>
                        ))}
                      </nav>
                    </div>
                    
                    {/* Right: System Controls (Secondary) */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <Suspense fallback={<div className="h-4 w-20" />}>
                        <TopNSelector />
                      </Suspense>
                      <div className="w-px h-4 bg-black/10" />
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-medium text-black/60">
                          {digest.totals.total}
                        </span>
                        <span className="text-[11px] text-black/40">
                          articles analysed this week
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CATEGORY SECTIONS UI - Client-side rendering with reactive TopN */}
              <Suspense fallback={
                <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {CATEGORY_CARDS.map(cat => (
                    <div key={cat.key} className="w-full">
                      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-4 md:p-7 h-64 animate-pulse" />
                    </div>
                  ))}
                </div>
              }>
                <DigestClientView digest={digest} categoryCards={CATEGORY_CARDS} variant="home" />
              </Suspense>

              {/* Key Themes Summary (Home Page) */}
              {(digest.keyThemes && digest.keyThemes.length > 0) || digest.oneSentenceSummary ? (
                <div className="mt-8 md:mt-10 pt-6 md:pt-8 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-center">
                    {digest.oneSentenceSummary && (
                      <p className="text-base md:text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                        {digest.oneSentenceSummary}
                      </p>
                    )}
                    {digest.keyThemes && digest.keyThemes.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-center">
                        {digest.keyThemes.map((theme, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
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
