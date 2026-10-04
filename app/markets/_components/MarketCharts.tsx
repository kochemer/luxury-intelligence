/**
 * The two summary charts: share of voice and 3-month share-price change.
 * Plain HTML bars on one scale each: server-rendered, readable without JS.
 */

import type { MarketData } from '@/lib/markets/types';
import { formatPct } from './format';

export function ShareOfVoice({ data }: { data: MarketData }) {
  const rows = [...data.brands].sort((a, b) => b.mentions - a.mentions);
  const max = Math.max(1, rows[0]?.mentions ?? 1);
  return (
    <div className="grid gap-[7px]">
      {rows.map((r, i) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,130px)_1fr_74px] items-center gap-2.5 text-[13px]">
          <span className="truncate">{r.name}</span>
          <span className="relative h-3.5">
            <span
              className="absolute inset-y-0 left-0 rounded-[2px]"
              style={{ width: `${(r.mentions / max) * 100}%`, background: i === 0 ? 'var(--color-accent)' : 'var(--color-bar)' }}
            />
          </span>
          <span className="font-ibm-mono text-[12px] text-[var(--color-text-secondary)] text-right tabular-nums">
            {r.mentions} · {data.totalMentions ? Math.round((r.mentions / data.totalMentions) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function PriceChange({ data }: { data: MarketData }) {
  const prices = [...data.prices].sort((a, b) => b.change3m - a.change3m);
  if (prices.length === 0) return <p className="text-[13px] text-[var(--color-text-secondary)]">No share prices this week.</p>;
  const lim = Math.max(...prices.map(p => Math.abs(p.change3m)), 1);
  return (
    <div className="grid gap-[7px]">
      {prices.map(p => {
        const w = (Math.abs(p.change3m) / lim) * 50;
        const up = p.change3m >= 0;
        return (
          <div key={p.ticker} className="grid grid-cols-[minmax(0,130px)_1fr_74px] items-center gap-2.5 text-[13px]">
            <span className="truncate">{p.company}{p.stale && <span className="text-[var(--color-text-secondary)]" title="This week's price fetch failed; showing last week's"> *</span>}</span>
            <span className="relative h-3.5">
              <span className="absolute -top-1 -bottom-1 left-1/2 w-px bg-[var(--color-text-secondary)] opacity-50" />
              <span
                className="absolute inset-y-0 rounded-[2px]"
                style={{ left: `${up ? 50 : 50 - w}%`, width: `${w}%`, background: up ? 'var(--color-up)' : 'var(--color-down)' }}
              />
            </span>
            <span className="font-ibm-mono text-[12px] text-[var(--color-text-secondary)] text-right tabular-nums">{formatPct(p.change3m)}</span>
          </div>
        );
      })}
    </div>
  );
}
