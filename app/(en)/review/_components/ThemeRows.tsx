/**
 * One row per theme: name, a bar per month on a shared scale, and the average
 * share in each half of the period. Plain HTML, server-rendered.
 */

import type { ThemeRow } from '@/lib/review/types';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (ym: string) => MONTH[Number(ym.slice(5)) - 1] ?? ym;

/** A month counts as a peak at this share or more, and this many times the theme's median month. */
export const PEAK_MIN_SHARE = 8;
export const PEAK_TIMES_MEDIAN = 1.8;

/** Is `value` a peak month for this theme? The page's callout and the highlighted bar use this one rule. */
export function isPeak(row: ThemeRow, value: number): boolean {
  const sorted = [...row.monthlyShare].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return value >= PEAK_MIN_SHARE && value >= median * PEAK_TIMES_MEDIAN && value === Math.max(...row.monthlyShare);
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_52px_52px] md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_72px_72px] gap-x-3 md:gap-x-5';

export default function ThemeRows({ rows, months, firstLabel, secondLabel }: { rows: ThemeRow[]; months: string[]; firstLabel: string; secondLabel: string }) {
  const max = Math.max(1, ...rows.flatMap(r => r.monthlyShare));
  return (
    <div role="table" aria-label="Themes: share of headlines by month" className="grid gap-0">
      <div role="row" className={`${GRID} items-end pb-2 border-b border-[var(--color-border)] font-medium text-[11px] tracking-[0.12em] uppercase text-[var(--color-text-secondary)]`}>
        {/* On phones the name sits on its own line above the bars, so its header is for screen readers only. */}
        <span role="columnheader" className="sr-only md:not-sr-only">Theme</span>
        <span role="columnheader" className="flex justify-between"><span>{monthName(months[0]!)}</span><span className="sr-only"> to </span><span>{monthName(months.at(-1)!)}</span></span>
        <span role="columnheader" className="text-right">{firstLabel}</span>
        <span role="columnheader" className="text-right">{secondLabel}</span>
      </div>
      {rows.map(r => {
        const down = r.ratio != null && r.ratio <= 0.75, up = r.ratio != null && r.ratio >= 1.25;
        return (
          <div role="row" key={r.name} className={`${GRID} gap-y-1.5 items-end py-2.5 border-b border-[var(--color-border)]`}>
            <span role="cell" className="col-span-3 md:col-span-1 text-[14px] md:text-[15px] leading-[1.25] self-center">{r.name}</span>
            <span role="cell" className="flex items-end gap-[3px] h-7 md:h-9">
              <span className="sr-only">{r.monthlyShare.map((v, i) => `${monthName(months[i]!)} ${v}%${isPeak(r, v) ? ' (peak)' : ''}`).join(', ')}</span>
              {r.monthlyShare.map((v, i) => (
                <span key={months[i]} aria-hidden="true" className="flex-1 rounded-t-[2px]"
                  style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: isPeak(r, v) ? 'var(--color-accent)' : 'var(--color-bar)' }} />
              ))}
            </span>
            <span role="cell" className="text-right font-ibm-mono text-[13px] tabular-nums self-center">{r.firstHalf.toFixed(1)}%</span>
            <span role="cell" className="text-right font-ibm-mono text-[13px] tabular-nums self-center" style={down ? { color: 'var(--color-down)' } : up ? { color: 'var(--color-up)' } : undefined}>
              {r.secondHalf.toFixed(1)}%{(down || up) && <span className="sr-only"> ({down ? 'down' : 'up'})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
