/**
 * Share-of-voice bars. Plain HTML on one scale: server-rendered, readable without JS.
 */

import type { MarketData } from '@/lib/markets/types';

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
