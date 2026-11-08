/**
 * LOCAL preview of the markets page with a redesigned Signals section
 * (ThemeTable). Same as the live page otherwise. Not linked, not indexed.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { loadMarket } from '@/lib/markets/load';
import { MARKET_IDS, MARKET_LABEL, type MarketId } from '@/lib/markets/types';
import { buildBreadcrumbLd } from '@/lib/seo/jsonLd';
import JsonLd from '../../../components/JsonLd';
import ThemeTable from '../../_components/ThemeTable';
import { ShareOfVoice } from '../../_components/MarketCharts';
import AttentionChart from '../../_components/AttentionChart';
import Trackers from '../../_components/Trackers';
import { formatPct } from '../../_components/format';

const siteUrl = getSiteUrl();

export const dynamicParams = false;
export function generateStaticParams() {
  return MARKET_IDS.map(market => ({ market }));
}

type Params = { params: Promise<{ market: string }> };

function asMarket(m: string): MarketId | null {
  return (MARKET_IDS as string[]).includes(m) ? (m as MarketId) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const market = asMarket((await params).market);
  if (!market) return {};
  return { title: `${MARKET_LABEL[market]} market (preview)`, robots: { index: false, follow: false } };
}

const SECTION = 'py-10 border-b border-[var(--color-border)]';
const H2 = 'font-display font-semibold text-[28px] md:text-[32px] leading-[1.2] mb-2';
const SUB = 'text-[15px] text-[var(--color-text-secondary)] max-w-[46em] mb-6';
const TH = 'font-medium text-[11px] tracking-[0.14em] uppercase text-[var(--color-text-secondary)] text-left py-2 pr-4 border-b border-[var(--color-border)] whitespace-nowrap';
const TD = 'py-2 pr-4 border-b border-[var(--color-border)] whitespace-nowrap';
const NUM = 'text-right font-ibm-mono text-[13px] tabular-nums';
const NOTE = 'text-[12.5px] text-[var(--color-text-secondary)] max-w-[60em] mt-4';

const nf = (n: number) => n.toLocaleString('en-GB');

export default async function MarketPage({ params }: Params) {
  const market = asMarket((await params).market);
  if (!market) notFound();
  const data = await loadMarket(market);
  const label = MARKET_LABEL[market];
  const R = data?.rules;
  const upColour = (n: number) => ({ color: n >= 0 ? 'var(--color-up)' : 'var(--color-down)' });

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-8 py-10 md:py-14 text-[var(--color-text-primary)]">
      <div className="mb-6 border border-[var(--color-border)] px-3 py-1.5 text-[12.5px] text-[var(--color-text-secondary)]">
        Preview — not live. <Link href={`/markets/${market}`} className="text-[var(--color-accent)] underline underline-offset-[3px]">See the live page</Link>
      </div>

      <JsonLd data={buildBreadcrumbLd({
        siteUrl,
        items: [{ name: 'Home', url: `${siteUrl}/` }, { name: `${label} market` }],
      })} />

      {/* Each market is its own page with its own nav entry; the other one is a link away. */}
      <header className="pb-6 border-b border-[var(--color-border)]">
        <p className="intel-section-label text-[var(--color-accent)] mb-3">Weekly market intelligence</p>
        <h1 className="font-display font-semibold leading-none tracking-[-0.01em] mb-3" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)' }}>
          {label} market
        </h1>
        <p className="text-[var(--color-text-secondary)] text-[18px] max-w-[46em]">
          {data
            ? `What ${nf(data.panel.articles)} trade-press articles say this quarter, what the companies did, and where the market disagrees with the coverage.`
            : 'Trade-press coverage, what the companies did, and where the market disagrees with the coverage.'}
        </p>
        {MARKET_IDS.filter(m => m !== market).map(m => (
          <Link key={m} href={`/markets/${m}`} className="inline-block mt-3 text-[14px] text-[var(--color-accent)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
            {MARKET_LABEL[m]} market →
          </Link>
        ))}
      </header>

      {!data || !R ? (
        <p className="py-10 text-[var(--color-text-secondary)]">This page is being prepared and will appear after the next weekly update.</p>
      ) : (
        <>
          {/* 1. Signals */}
          <section className="bg-[var(--color-surface)] border-b border-[var(--color-border)] -mx-4 md:mx-0 px-4 md:px-8 py-12" aria-labelledby="signals-h">
            <ThemeTable data={data} market={market} h2Class={H2} subClass={SUB} noteClass={NOTE} />
          </section>

          {/* 2. Attention vs performance */}
          {data.attention.length > 0 && (
            <section className={SECTION} aria-labelledby="attention-h">
              <p className="intel-section-label text-[var(--color-accent)] mb-3">Where the market disagrees</p>
              <h2 id="attention-h" className={H2}>Attention vs performance</h2>
              <p className={SUB}>Coverage in 12 weeks against the 3-month share-price change. Companies far from the line are moving without the press, or the press is busy while the shares fall.</p>

              {data.callouts.length > 0 && (
                <ul className="list-none m-0 mb-7 p-0">
                  {data.callouts.map(c => {
                    const down = c.kind === 'loud' || c.change3m < 0;
                    return (
                      <li key={`${c.company}-${c.kind}`} className="grid grid-cols-[28px_1fr] gap-1.5 font-display font-semibold text-[22px] md:text-[26px] leading-[1.25] mb-3 max-w-[34em]" style={c.kind === 'loud' ? { color: 'var(--color-down)' } : undefined}>
                        <span className="text-[18px] pt-[5px]" style={{ color: down ? 'var(--color-down)' : 'var(--color-up)' }} aria-hidden="true">{down ? '▼' : '▲'}</span>
                        <span>{c.text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <AttentionChart rows={data.attention} />

              <div className="overflow-x-auto mt-5">
                <table className="w-full border-collapse text-[14px]">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>Company</th>
                      <th scope="col" className={`${TH} text-right`}>Articles</th>
                      <th scope="col" className={`${TH} text-right`}>3-month change</th>
                      <th scope="col" className={`${TH} text-right`}>1-month change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.attention].sort((a, b) => b.articles - a.articles).map(a => (
                      <tr key={a.ticker}>
                        <td className={TD}>{a.company}</td>
                        <td className={`${TD} ${NUM}`}>{nf(a.articles)}</td>
                        <td className={`${TD} ${NUM}`} style={upColour(a.change3m)}>{formatPct(a.change3m)}</td>
                        <td className={`${TD} ${NUM}`} style={upColour(a.change1m)}>{formatPct(a.change1m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={NOTE}>Share prices: Yahoo Finance, local currency. Coverage counts a company together with its brands (LVMH includes Louis Vuitton, Dior, Bulgari, Tiffany…), across all sources.</p>
            </section>
          )}

          {/* 3. Trackers */}
          <section className={SECTION} aria-labelledby="trackers-h">
            <p className="intel-section-label text-[var(--color-accent)] mb-3">Trackers</p>
            <h2 id="trackers-h" className={H2}>The record, week by week</h2>
            <p className={SUB}>Every price change, appointment, opening, result and deal we classified, last six weeks. The record grows every week.</p>
            <Trackers moves={data.moves} />
          </section>

          {/* 4. This week (demoted) */}
          {data.summary && data.summary.length > 0 && (
            <section className="py-9 border-b border-[var(--color-border)]" aria-labelledby="week-h">
              <p className="intel-section-label text-[var(--color-accent)] mb-3" id="week-h">This week</p>
              <ul className="m-0 pl-[18px] max-w-[50em] text-[15px] list-disc marker:text-[var(--color-accent)]">
                {data.summary.map(s => <li key={s} className="my-1.5">{s}</li>)}
              </ul>
            </section>
          )}

          {/* 5. Share of voice (demoted) */}
          <section className="py-9 border-b border-[var(--color-border)]" aria-labelledby="sov-h">
            <p className="intel-section-label text-[var(--color-accent)] mb-3" id="sov-h">Share of voice</p>
            <div className="max-w-[640px]"><ShareOfVoice data={data} /></div>
            <p className={NOTE}>Articles naming each brand, 12 weeks; an article naming two brands counts for both. Mostly reflects which outlets are read — kept for reference.</p>
          </section>

          {/* 6. Method */}
          <footer className="py-7 text-[12.5px] text-[var(--color-text-secondary)] grid gap-2 max-w-[75ch]">
            <p><strong className="text-[var(--color-text-primary)]">Method.</strong> Signals count articles from the {market} trade-press panel ({nf(data.panel.outlets)} outlets); watch blogs and design press are excluded because product reviews dilute market themes. Share prices come from Yahoo Finance. Moves are classified by an AI model from the publication’s sources and Google News, and link to the original reports.</p>
            <p>Updated {new Date(data.generatedAtISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
          </footer>
        </>
      )}
    </div>
  );
}
