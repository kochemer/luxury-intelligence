/**
 * /markets/luxury and /markets/jewellery: who the trade press writes about,
 * what the companies did, and how their shares moved. Refreshed weekly by
 * markets/buildMarkets.ts; replaces Competitor Watch.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { loadMarket } from '@/lib/markets/load';
import { MARKET_IDS, MARKET_LABEL, type MarketId } from '@/lib/markets/types';
import { buildBreadcrumbLd } from '@/lib/seo/jsonLd';
import JsonLd from '../../components/JsonLd';
import { ShareOfVoice, PriceChange } from '../_components/MarketCharts';
import MarketExplorer from '../_components/MarketExplorer';
import { formatDay } from '../_components/format';

const siteUrl = getSiteUrl();

export const dynamicParams = false;
export function generateStaticParams() {
  return MARKET_IDS.map(market => ({ market }));
}

const COPY: Record<MarketId, { title: string; description: string; dek: string; sovNote: string }> = {
  luxury: {
    title: 'Luxury Industry News & Brand Moves',
    description: 'What LVMH, Chanel, Hermès, Kering, Rolex and other luxury houses did this week, who the trade press is writing about, and how their shares moved.',
    dek: 'Who the luxury trade press is writing about, what the houses actually did, and how their shares moved. Updated every Sunday with the digest.',
    sovNote: 'Several watch blogs are among the sources, which lifts Rolex. Share of voice reflects the source mix as much as the brands.',
  },
  jewellery: {
    title: 'Jewellery Industry News & Brand Moves',
    description: 'What Cartier, Tiffany, Pandora, Signet, De Beers and other jewellery brands did this week, who the trade press is writing about, and how their shares moved.',
    dek: 'Who the jewellery trade press is writing about, what the brands actually did, and how their shares moved. Updated every Sunday with the digest.',
    sovNote: 'Jewellery brands get little coverage in the publication’s sources, so these counts are small. Moves also draw on wider news.',
  },
};

type Params = { params: Promise<{ market: string }> };

function asMarket(m: string): MarketId | null {
  return (MARKET_IDS as string[]).includes(m) ? (m as MarketId) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const market = asMarket((await params).market);
  if (!market) return {};
  const { title, description } = COPY[market];
  const url = `${siteUrl}/markets/${market}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} | Luxury Intelligence`, description, url, images: [`${siteUrl}/api/og`] },
    twitter: { title: `${title} | Luxury Intelligence`, description, images: [`${siteUrl}/api/og`] },
  };
}

export default async function MarketPage({ params }: Params) {
  const market = asMarket((await params).market);
  if (!market) notFound();
  const data = await loadMarket(market);
  const copy = COPY[market];

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-8 py-10 md:py-14 text-[var(--color-text-primary)]">
      <JsonLd data={buildBreadcrumbLd({
        siteUrl,
        items: [{ name: 'Home', url: `${siteUrl}/` }, { name: `${MARKET_LABEL[market]} markets` }],
      })} />

      <header className="pb-2">
        <p className="intel-section-label text-[var(--color-accent)] mb-3">Markets</p>
        <h1 className="font-display font-semibold leading-none tracking-[-0.01em] mb-3" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)' }}>
          {MARKET_LABEL[market]}
        </h1>
        <p className="text-[var(--color-text-secondary)] max-w-[62ch]">{copy.dek}</p>
        <nav className="flex gap-1 mt-6 border-b border-[var(--color-border)]" aria-label="Markets">
          {MARKET_IDS.map(m => (
            <Link
              key={m}
              href={`/markets/${m}`}
              aria-current={m === market ? 'page' : undefined}
              className={`px-3.5 py-2.5 -mb-px text-[14px] font-medium border-b-2 no-underline ${m === market ? 'border-[var(--color-accent)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]'}`}
            >
              {MARKET_LABEL[m]}
            </Link>
          ))}
        </nav>
      </header>

      {!data ? (
        <p className="py-10 text-[var(--color-text-secondary)]">This page is being prepared and will appear after the next weekly update.</p>
      ) : (
        <>
          {data.summary && (
            <section className="grid md:grid-cols-[200px_1fr] gap-5 py-8 border-b border-[var(--color-border)]" aria-labelledby="week-h">
              <div>
                <h2 id="week-h" className="font-display font-semibold text-[26px] mb-1">This week</h2>
                <p className="font-ibm-mono text-[11px] tracking-[0.12em] uppercase text-[var(--color-text-secondary)]">{data.weekLabel.replace('-W', ' · week ')}</p>
              </div>
              <ul className="list-none p-0 m-0 grid gap-3 max-w-[72ch]">
                {data.summary.map(s => (
                  <li key={s} className="relative pl-[18px] text-[17px] leading-relaxed before:content-[''] before:absolute before:left-0 before:top-[0.72em] before:w-2 before:h-px before:bg-[var(--color-accent)]">{s}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid md:grid-cols-2 gap-10 py-8 border-b border-[var(--color-border)]">
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-[26px] mb-1">Share of voice</h2>
              <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">Share of {data.totalMentions} articles naming a tracked brand, {formatDay(data.window.start)} – {formatDay(data.window.end)}.</p>
              <ShareOfVoice data={data} />
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-3 max-w-[60ch]">{copy.sovNote}</p>
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-[26px] mb-1">Share price, 3 months</h2>
              <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">Change in local currency. Groups, not brands: Cartier trades as Richemont.</p>
              <PriceChange data={data} />
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-3">Private houses have no share price.</p>
            </div>
          </section>

          <MarketExplorer moves={data.moves} brands={data.brands} prices={data.prices} />

          <footer className="py-7 text-[12.5px] text-[var(--color-text-secondary)] grid gap-2 max-w-[75ch]">
            <p><strong className="text-[var(--color-text-primary)]">Method.</strong> Coverage counts articles naming the brand among the {data.articlesScreened.toLocaleString('en-GB')} the publication screened over 12 weeks. It measures what the trade press writes about, not what customers buy. Trends compare the last four weeks with the eight before, and only for brands with at least ten articles. Moves are classified by an AI model from the publication’s sources and Google News, and link to the original reports. Share prices from Yahoo Finance.</p>
            <p>Updated {new Date(data.generatedAtISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
          </footer>
        </>
      )}
    </div>
  );
}
