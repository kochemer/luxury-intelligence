'use client';

/**
 * Moves list and brand table. Client-side only for two small interactions:
 * selecting a brand filters the moves, and minor moves are hidden until asked
 * for. All content is in the server-rendered HTML.
 */

import { useState } from 'react';
import type { MarketBrandRow, MarketMove, MarketPrice } from '@/lib/markets/types';
import { CoverageSpark, PriceSpark, MoveChip, formatDay, formatPct } from './format';

const MAJOR_LIMIT = 25;

function Trend({ trend }: { trend: number | null }) {
  if (trend === null) return <span className="font-ibm-mono text-[12px] text-[var(--color-text-secondary)]" title="Too few articles for a trend">—</span>;
  if (trend >= 1.15) return <span className="font-ibm-mono text-[12px] whitespace-nowrap" style={{ color: 'var(--color-up)' }}>▲ {trend.toFixed(1)}×</span>;
  if (trend <= 0.85) return <span className="font-ibm-mono text-[12px] whitespace-nowrap" style={{ color: 'var(--color-down)' }}>▼ {trend.toFixed(1)}×</span>;
  return <span className="font-ibm-mono text-[12px] text-[var(--color-text-secondary)] whitespace-nowrap">● steady</span>;
}

function Move({ m }: { m: MarketMove }) {
  return (
    <li className="grid grid-cols-[64px_1fr] md:grid-cols-[72px_150px_120px_1fr] gap-x-3.5 gap-y-1 items-baseline py-[11px] border-t border-[var(--color-border)] first:border-t-0">
      <span className="font-ibm-mono text-[12px] text-[var(--color-text-secondary)] tabular-nums">{formatDay(m.date)}</span>
      <span className="font-semibold text-[14px]">{m.brand}</span>
      <span className="col-start-2 md:col-start-auto"><MoveChip type={m.type} /></span>
      <span className="col-span-2 md:col-span-1 min-w-0">
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-text-primary)] hover:text-[var(--color-accent)]">{m.title}</a>{' '}
        <span className="text-[12px] text-[var(--color-text-secondary)]">
          · {m.source}{m.outlets > 1 ? ` and ${m.outlets - 1} other${m.outlets > 2 ? 's' : ''}` : ''}
        </span>
      </span>
    </li>
  );
}

export default function MarketExplorer({ moves, brands, prices }: { moves: MarketMove[]; brands: MarketBrandRow[]; prices: MarketPrice[] }) {
  const [brand, setBrand] = useState<string | null>(null);
  const [showMinor, setShowMinor] = useState(false);

  const pool = brand ? moves.filter(m => m.brand === brand) : moves;
  const shown = showMinor || brand ? pool : pool.filter(m => m.importance === 'major').slice(0, MAJOR_LIMIT);
  const hidden = pool.length - shown.length;
  const maxWeekly = Math.max(0, ...brands.flatMap(b => b.weekly));
  const priceOf = (t: string | null) => (t ? prices.find(p => p.ticker === t) ?? null : null);

  const pick = (name: string) => {
    setBrand(cur => (cur === name ? null : name));
    document.getElementById('moves')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <section id="moves" className="py-8 border-b border-[var(--color-border)] scroll-mt-20" aria-labelledby="moves-h">
        <h2 id="moves-h" className="font-display font-semibold text-[26px] mb-1">Moves</h2>
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">
          What the companies actually did, last six weeks. {brand || showMinor ? 'All moves.' : 'Major moves only.'} Reviews, commentary and podcasts are left out.
        </p>
        <div className="flex flex-wrap items-center gap-2.5 mb-3 text-[13px]">
          {brand && (
            <>
              <span>Showing {brand} only.</span>
              <button type="button" onClick={() => setBrand(null)} className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-full px-2.5 py-0.5 text-[12px] font-medium cursor-pointer">Show all brands</button>
            </>
          )}
          {!brand && (
            <button type="button" onClick={() => setShowMinor(s => !s)} className="border border-[var(--color-border)] bg-[var(--color-surface)] rounded-full px-2.5 py-0.5 text-[12px] font-medium cursor-pointer">
              {showMinor ? 'Major moves only' : `Show all ${pool.length} moves`}
            </button>
          )}
        </div>
        {shown.length > 0 ? (
          <ul className="list-none p-0 m-0">{shown.map(m => <Move key={`${m.brand}-${m.date}-${m.headline}`} m={m} />)}</ul>
        ) : (
          <p className="text-[13px] text-[var(--color-text-secondary)]">No moves for {brand} in the last six weeks.</p>
        )}
        {!brand && !showMinor && hidden > 0 && (
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-2">{hidden} minor or older move{hidden === 1 ? '' : 's'} hidden.</p>
        )}
      </section>

      <section className="py-8 border-b border-[var(--color-border)]" aria-labelledby="brands-h">
        <h2 id="brands-h" className="font-display font-semibold text-[26px] mb-1">Brands</h2>
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">Select a brand to see its moves above.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className="text-left font-ibm-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-text-secondary)]">
                <th className="font-normal pb-2.5 pr-2.5 border-b border-[var(--color-border)]">Brand</th>
                <th className="font-normal pb-2.5 pr-2.5 border-b border-[var(--color-border)]">Coverage, 12 wks</th>
                <th className="font-normal pb-2.5 pr-2.5 border-b border-[var(--color-border)]">Trend</th>
                <th className="font-normal pb-2.5 pr-2.5 border-b border-[var(--color-border)]">Latest move</th>
                <th className="font-normal pb-2.5 border-b border-[var(--color-border)]">Share price, 3 mo</th>
              </tr>
            </thead>
            <tbody>
              {brands.map(b => {
                const p = priceOf(b.ticker);
                const selected = brand === b.name;
                return (
                  <tr
                    key={b.name}
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => pick(b.name)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(b.name); } }}
                    className={`cursor-pointer hover:bg-[var(--color-accent-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${selected ? 'bg-[var(--color-accent-light)]' : ''}`}
                  >
                    <td className="py-3 pr-2.5 border-b border-[var(--color-border)] align-middle">
                      <div className="font-semibold">{b.name}</div>
                      <div className="text-[12px] text-[var(--color-text-secondary)]">{b.group}</div>
                    </td>
                    <td className="py-3 pr-2.5 border-b border-[var(--color-border)] align-middle">
                      <div className="flex items-center gap-2.5"><CoverageSpark weekly={b.weekly} max={maxWeekly} /><span className="font-ibm-mono tabular-nums">{b.mentions}</span></div>
                    </td>
                    <td className="py-3 pr-2.5 border-b border-[var(--color-border)] align-middle"><Trend trend={b.trend} /></td>
                    <td className="py-3 pr-2.5 border-b border-[var(--color-border)] align-middle max-w-[340px] text-[13px]">
                      {b.latestMove ? (
                        <>
                          <MoveChip type={b.latestMove.type} />{' '}
                          <span className="font-ibm-mono text-[12px] text-[var(--color-text-secondary)]">{formatDay(b.latestMove.date)}</span>
                          <div>{b.latestMove.title}</div>
                        </>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">{b.mentions ? 'Mentioned, but no company move in six weeks' : 'No coverage'}</span>
                      )}
                    </td>
                    <td className="py-3 border-b border-[var(--color-border)] align-middle">
                      {p ? (
                        <>
                          <div className="flex items-center gap-2"><PriceSpark series={p.series} up={p.change3m >= 0} /><span className="font-ibm-mono tabular-nums">{formatPct(p.change3m)}</span></div>
                          {b.priceVia && <div className="text-[12px] text-[var(--color-text-secondary)]">via {b.priceVia}</div>}
                        </>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">{b.ticker ? 'Unavailable' : 'Private'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
