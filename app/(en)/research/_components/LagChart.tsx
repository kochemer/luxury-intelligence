/**
 * Correlation at each lag, as bars around zero. Server-rendered SVG: nine
 * bars need no JavaScript. Bars with p < 0.05 are drawn in the accent colour;
 * the exact values are in the table under the chart.
 */

import type { LagStat } from '@/lib/review/types';

const W = 360, H = 210;
const M = { l: 40, r: 8, t: 12, b: 44 };
const RANGE = 0.5;

/** `artefactLag`: a significant bar the method itself produces; drawn in outline, not in the accent colour. */
export default function LagChart({ stats, title, artefactLag }: { stats: LagStat[]; title: string; artefactLag?: number }) {
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const band = pw / stats.length;
  const Y = (r: number) => M.t + ((RANGE - Math.max(-RANGE, Math.min(RANGE, r))) / (2 * RANGE)) * ph;
  const ticks = [-0.4, -0.2, 0, 0.2, 0.4];
  const zeroLag = stats.findIndex(s => s.lag === 0);
  return (
    <figure className="m-0">
      <figcaption className="font-medium text-[15px] mb-2">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img"
        aria-label={`${title}: correlation at each lag from ${stats[0]?.lag} to +${stats.at(-1)?.lag} weeks. Values are in the table below.`}>
        {/* The same-week column, so the eye finds "before" and "after". */}
        {zeroLag >= 0 && <rect x={M.l + zeroLag * band} y={M.t} width={band} height={ph} fill="var(--color-accent-light)" />}
        <g className="font-ibm-mono" fill="var(--color-text-secondary)" fontSize={10}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? 'var(--color-text-secondary)' : 'var(--color-border)'} strokeWidth={1} />
              <text x={M.l - 6} y={Y(t) + 3.5} textAnchor="end">{t > 0 ? `+${t}` : t === 0 ? '0' : `−${Math.abs(t)}`}</text>
            </g>
          ))}
          {stats.map((s, i) => (
            <text key={s.lag} x={M.l + (i + 0.5) * band} y={H - M.b + 14} textAnchor="middle">{s.lag > 0 ? `+${s.lag}` : s.lag < 0 ? `−${Math.abs(s.lag)}` : '0'}</text>
          ))}
          <text x={M.l} y={H - 6} textAnchor="start" fontSize={10.5}>← share price first</text>
          <text x={W - M.r} y={H - 6} textAnchor="end" fontSize={10.5}>coverage first →</text>
          <text x={M.l + pw / 2} y={H - 20} textAnchor="middle" fontSize={10.5}>weeks</text>
        </g>
        {stats.map((s, i) => {
          const y0 = Y(0), y1 = Y(s.r);
          return (
            <rect key={s.lag} x={M.l + i * band + band * 0.2} width={band * 0.6} y={Math.min(y0, y1)} height={Math.max(1, Math.abs(y1 - y0))}
              fill={s.lag === artefactLag ? 'none' : s.p < 0.05 ? 'var(--color-accent)' : 'var(--color-bar)'}
              stroke={s.lag === artefactLag ? 'var(--color-text-secondary)' : undefined} strokeDasharray={s.lag === artefactLag ? '3 2' : undefined} rx={1}>
              <title>{`${s.lag} weeks: r = ${s.r.toFixed(2)}, p = ${s.p.toFixed(3)}, n = ${s.n}`}</title>
            </rect>
          );
        })}
      </svg>
    </figure>
  );
}
