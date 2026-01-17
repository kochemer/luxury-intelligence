import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import DigestClientView from '../components/DigestClientView';
import TopNSelector from '../components/TopNSelector';
import { TopicKey } from '../../utils/topicNames';
import { formatDate } from '../../utils/formatDate';

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
    title: 'E-handel & Detailhandel Tech',
    desc: 'Fremskridt og tendenser, der former online handel, detailhandel og nye teknologier.',
    countBy: 'EcommerceRetail',
    topInfo: 'Top 7 artikler efter nylighed',
    anchorId: 'ecommerce-retail-tech',
  },
  {
    key: 'Jewellery_Industry',
    color: '#be8b36',
    title: 'Smykkeindustrien',
    desc: 'Vigtige opdateringer og artikler om smykkemærker, handel og forsyningskæde.',
    countBy: 'Jewellery',
    topInfo: 'Top 7 artikler efter nylighed',
    anchorId: 'jewellery-industry',
  },
  {
    key: 'AI_and_Strategy',
    color: '#25505f',
    title: 'Kunstig Intelligens Nyheder',
    desc: 'De seneste fremskridt og strategier inden for kunstig intelligens og forretningstransformation.',
    countBy: 'AIStrategy',
    topInfo: 'Top 7 artikler efter relevans',
    anchorId: 'ai-strategy',
  },
  {
    key: 'Luxury_and_Consumer',
    color: '#6b2d5c',
    title: 'Mode & Luksus',
    desc: 'Innovationer og ændringer i luksus og bredere forbrugerprodukter, oplevelser og mærker.',
    countBy: 'LuxuryConsumer',
    topInfo: 'Top 7 artikler efter nylighed',
    anchorId: 'luxury-consumer',
  },
];


export default async function HomeDA() {
  const weekLabel = getPreviousWeek();
  const digest = await loadDigest(weekLabel);

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
        minHeight: 240,
        background: 'linear-gradient(120deg,#6b2d5c 50%, #8b4a7a 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderBottom: '1px solid #e5e7eb'
      }}>
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
            Ugentlig intelligens om AI, e-handel, luksus og smykker.
          </div>
          <p className="text-sm md:text-base text-gray-300 mb-5">
            Kurerede artikler, signaler og kontekst — udvalgt og sammenfattet af AI-agenter hver uge.
          </p>
          <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, flexWrap: 'wrap'}}>
            <Link
              href="/subscribe"
              style={{
                fontWeight: 600,
                color: '#06244c',
                background: '#fed236',
                borderRadius: 4,
                padding: '0.6rem 1.4rem',
                textDecoration: 'none',
                transition: 'background 0.2s',
                fontSize: '1rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}
            >
              Abonner (email-oversigt)
            </Link>
            <span className="text-gray-300 text-sm">•</span>
            <Link href="/archive" className="text-sm md:text-base text-gray-200 hover:text-white underline">
              Gennemse arkiv
            </Link>
            <span className="text-gray-300 text-sm">•</span>
            <Link href="/about" className="text-sm md:text-base text-gray-200 hover:text-white underline">
              Om
            </Link>
            <span className="text-gray-300 text-sm">•</span>
            <Link href="/support" className="text-sm md:text-base text-gray-200 hover:text-white underline">
              Support
            </Link>
          </div>
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
          <h2 style={{margin: '0 0 1rem 0', fontSize: '1.6rem', fontWeight: 600}}>Oversigt endnu ikke bygget</h2>
          <p style={{marginBottom:'1.1rem'}}>Ingen oversigt fundet for denne uge.</p>
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
                  Denne uges omslag
                </h3>
                <div className="flex items-center gap-3 flex-wrap text-xs md:text-sm text-gray-600">
                  <span>
                    {formatDate(digest.startISO)} til {formatDate(digest.endISO)}
                    {digest.builtAtLocal && (
                      <span className="ml-1">• Bygget {digest.builtAtLocal}</span>
                    )}
                  </span>
                </div>
              </div>
              <div className="relative w-full rounded-lg overflow-hidden" style={{ height: '432px' }}>
                <img
                  src={digest.coverImageUrl}
                  alt={digest.coverImageAlt || `Ugentlig oversigt omslag for ${digest.weekLabel}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-black bg-opacity-50 px-6 md:px-8 py-3 md:py-4 rounded-lg">
                    <h2 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                      Uge {digest.weekLabel}
                    </h2>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Weekly Digest Summary / Meta */}
        <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-4 md:mb-6 pb-6 border-b border-gray-200">
          <div className="flex items-baseline justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-1">
                Uge {digest.weekLabel}
              </h2>
              <p className="text-sm md:text-base text-gray-500">
                {formatDate(digest.startISO)} til {formatDate(digest.endISO)}
                {digest.builtAtLocal && (
                  <span className="ml-2">• Bygget {digest.builtAtLocal}</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm md:text-base text-gray-500">
                {digest.totals.total} artikler behandlet denne uge
              </p>
            </div>
          </div>
        </section>

        {/* Category Jump Navigation */}
        <section className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8 mb-4 md:mb-6">
          <div className="flex flex-col items-center gap-4">
            <nav className="flex flex-wrap gap-2 justify-center" aria-label="Kategorinavigation">
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
      </>
      )}
    </main>
  );
}


