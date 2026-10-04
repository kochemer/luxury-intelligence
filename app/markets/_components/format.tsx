/**
 * Small shared pieces for the Markets pages. No hooks, so both the server
 * page and the client explorer can use them.
 */

export function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatPct(n: number): string {
  const sign = n > 0.05 ? '+' : n < -0.05 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

/** Weekly article counts as bars. `max` is shared across rows so they compare. */
export function CoverageSpark({ weekly, max }: { weekly: number[]; max: number }) {
  const w = 6, gap = 2, h = 26, width = weekly.length * (w + gap) - gap;
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={`Articles per week, oldest first: ${weekly.join(', ')}`} className="block shrink-0">
      {weekly.map((v, i) => {
        const bh = max > 0 ? Math.max(v ? 2 : 0, (v / max) * h) : 0;
        return <rect key={i} x={i * (w + gap)} y={h - bh} width={w} height={bh} fill={i >= weekly.length - 4 ? 'var(--color-accent)' : 'var(--color-bar)'} />;
      })}
      <rect x={0} y={h - 1} width={width} height={1} fill="var(--color-border)" />
    </svg>
  );
}

/** A price line, scaled to its own range, with the endpoint marked. */
export function PriceSpark({ series, up }: { series: number[]; up: boolean }) {
  const W = 96, H = 26;
  if (series.length < 2) return null;
  const min = Math.min(...series), max = Math.max(...series), range = max - min || 1;
  const pts = series.map((v, i) => [2 + (i / (series.length - 1)) * (W - 4), H - 3 - ((v - min) / range) * (H - 6)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const colour = up ? 'var(--color-up)' : 'var(--color-down)';
  const end = pts[pts.length - 1]!;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="block shrink-0">
      <path d={d} fill="none" stroke={colour} strokeWidth={1.5} />
      <circle cx={end[0]} cy={end[1]} r={2.4} fill={colour} />
    </svg>
  );
}

export function MoveChip({ type }: { type: string }) {
  return (
    <span className="inline-block font-ibm-mono text-[10.5px] tracking-[0.06em] uppercase px-[7px] py-[1px] rounded-[3px] bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-border)] whitespace-nowrap">
      {type}
    </span>
  );
}
