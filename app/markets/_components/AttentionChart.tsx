'use client';

/**
 * Coverage (square-root x) against 3-month share-price change (y), one dot per
 * company. Measures its container and redraws on resize; labels are placed to
 * avoid each other, the dots and the plot edges. Renders at a default width on
 * the server so nothing jumps in.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AttentionRow } from '@/lib/markets/types';
import { formatPct } from './format';

const DEFAULT_W = 720;
const R = 5;
type Box = { x0: number; x1: number; y0: number; y1: number };
type Anchor = 'start' | 'end' | 'middle';
const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;

export default function AttentionChart({ rows }: { rows: AttentionRow[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_W);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const W = Math.max(300, width), narrow = W < 560, H = narrow ? 400 : 420;
    const fs = narrow ? 11 : 12;
    const M = { l: narrow ? 44 : 56, r: narrow ? 14 : 24, t: 14, b: narrow ? 46 : 52 };
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const maxA = Math.max(1, ...rows.map(p => p.articles));
    const xDomain = maxA * 1.06, xMax = Math.sqrt(xDomain);
    const X = (a: number) => M.l + (Math.sqrt(Math.max(0, a)) / xMax) * pw;
    const maxAbs = Math.max(0, ...rows.map(p => Math.abs(p.change3m)));
    const yR = Math.max(25, Math.ceil(maxAbs / 5) * 5);
    const Y = (v: number) => M.t + ((yR - v) / (2 * yR)) * ph;

    const step = yR > 30 ? 10 : 5;
    const yTicks: number[] = [];
    for (let v = Math.ceil(-yR / step) * step; v <= yR; v += step) yTicks.push(v);

    const xTicks: number[] = [];
    let lastX = -Infinity;
    for (const t of [0, 10, 25, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]) {
      if (t > xDomain) break;
      if (X(t) - lastX >= 34) { xTicks.push(t); lastX = X(t); }
    }

    const tw = (s: string) => s.length * fs * 0.6 + 2, th = fs + 2;
    const dots = rows.map(p => ({ p, x: X(p.articles), y: Y(p.change3m) }));
    const dotBoxes: Box[] = dots.map(d => ({ x0: d.x - R - 1, x1: d.x + R + 1, y0: d.y - R - 1, y1: d.y + R + 1 }));
    const placed: Box[] = [];
    const labels: { x: number; y: number; a: Anchor; text: string }[] = [];
    [...dots].sort((a, b) => a.y - b.y).forEach(d => {
      const w = tw(d.p.company), gp = R + 4;
      const cands: { x: number; y: number; a: Anchor; b: Box }[] = [
        { x: d.x + gp, y: d.y + fs / 2 - 2, a: 'start', b: { x0: d.x + gp, x1: d.x + gp + w, y0: d.y - th / 2, y1: d.y + th / 2 } },
        { x: d.x - gp, y: d.y + fs / 2 - 2, a: 'end', b: { x0: d.x - gp - w, x1: d.x - gp, y0: d.y - th / 2, y1: d.y + th / 2 } },
        { x: d.x, y: d.y - gp - 2, a: 'middle', b: { x0: d.x - w / 2, x1: d.x + w / 2, y0: d.y - gp - th, y1: d.y - gp + 2 } },
        { x: d.x, y: d.y + gp + fs, a: 'middle', b: { x0: d.x - w / 2, x1: d.x + w / 2, y0: d.y + gp, y1: d.y + gp + th } },
        { x: d.x + gp, y: d.y - gp, a: 'start', b: { x0: d.x + gp, x1: d.x + gp + w, y0: d.y - gp - th, y1: d.y - gp } },
        { x: d.x + gp, y: d.y + gp + fs - 2, a: 'start', b: { x0: d.x + gp, x1: d.x + gp + w, y0: d.y + gp - 2, y1: d.y + gp + th - 2 } },
        { x: d.x - gp, y: d.y - gp, a: 'end', b: { x0: d.x - gp - w, x1: d.x - gp, y0: d.y - gp - th, y1: d.y - gp } },
        { x: d.x - gp, y: d.y + gp + fs - 2, a: 'end', b: { x0: d.x - gp - w, x1: d.x - gp, y0: d.y + gp - 2, y1: d.y + gp + th - 2 } },
      ];
      let best = cands[0]!, bs = Infinity;
      cands.forEach((c, i) => {
        let s = i * 0.01;
        s += (Math.max(0, 4 - c.b.x0) + Math.max(0, c.b.x1 - (W - 4)) + Math.max(0, M.t - c.b.y0) + Math.max(0, c.b.y1 - (H - M.b))) * 100;
        placed.forEach(b => { if (hit(c.b, b)) s += 1000; });
        dotBoxes.forEach(b => { if (hit(c.b, b)) s += 1000; });
        if (s < bs) { bs = s; best = c; }
      });
      placed.push(best.b);
      labels.push({ x: best.x, y: best.y, a: best.a, text: d.p.company });
    });
    return { W, H, fs, M, pw, ph, X, Y, yTicks, xTicks, dots, labels };
  }, [rows, width]);

  const { W, H, fs, M, pw, ph, X, Y, yTicks, xTicks, dots, labels } = g;
  return (
    <div ref={hostRef} className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`} width={W} height={H}
        className="block w-full h-auto max-h-[420px]"
        role="img"
        aria-label="Scatter chart: articles in 12 weeks against 3-month share price change, one dot per company. Values are in the table below."
      >
        <g className="font-ibm-mono" fill="var(--color-text-secondary)">
          {yTicks.map(v => (
            <g key={`y${v}`}>
              <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--color-text-secondary)' : 'var(--color-border)'} strokeWidth={1} strokeDasharray={v === 0 ? '3 3' : undefined} opacity={v === 0 ? 0.7 : 1} />
              <text x={M.l - 8} y={Y(v) + 4} textAnchor="end" fontSize={fs}>{signed(v)}</text>
            </g>
          ))}
          {xTicks.map(t => (
            <g key={`x${t}`}>
              <line x1={X(t)} x2={X(t)} y1={M.t} y2={H - M.b} stroke="var(--color-border)" strokeWidth={1} />
              <text x={X(t)} y={H - M.b + 16} textAnchor="middle" fontSize={fs}>{t}</text>
            </g>
          ))}
        </g>
        <g fill="var(--color-text-secondary)">
          <text x={M.l + pw / 2} y={H - 8} textAnchor="middle" fontSize={fs + 1}>Articles in 12 weeks (square-root scale)</text>
          <text x={0} y={0} textAnchor="middle" fontSize={fs + 1} transform={`translate(12 ${M.t + ph / 2}) rotate(-90)`}>Share price, 3 months</text>
        </g>
        {dots.map(d => (
          <circle key={d.p.ticker} cx={d.x} cy={d.y} r={R} fill={d.p.change3m >= 0 ? 'var(--color-up)' : 'var(--color-down)'}>
            <title>{`${d.p.company}: ${d.p.articles} articles, ${formatPct(d.p.change3m)} in 3 months`}</title>
          </circle>
        ))}
        <g fill="var(--color-text-primary)" fontWeight={500}>
          {labels.map(l => (
            <text key={l.text} x={l.x} y={l.y} textAnchor={l.a} fontSize={fs}>{l.text}</text>
          ))}
        </g>
      </svg>
    </div>
  );
}
