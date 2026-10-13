'use client';

import { useRef, useState, useEffect } from 'react';
import BrandPattern from './BrandPattern';
import { useCountUp } from '@/hooks/useCountUp';

type StatsBarProps = {
  /** Total articles analysed (rendered server-side; counts up from 0 when scrolled into view) */
  totalArticles: number;
  /** Label below the number, e.g. "articles analysed this week" */
  primaryLabel?: string;
  /** Optional secondary line, e.g. "434 articles analysed · 28 selected · 4 categories · ~12 min podcast" */
  secondaryLine?: string;
};

export default function StatsBar({ totalArticles, primaryLabel = 'articles analysed this week', secondaryLine }: StatsBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || triggered || totalArticles <= 0) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setTriggered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [totalArticles, triggered]);

  const displayValue = useCountUp(totalArticles, 1200, triggered);

  return (
    <div
      ref={containerRef}
      className="relative w-full py-10 sm:py-12 bg-[var(--color-accent-light)] text-center overflow-hidden reveal reveal-d2"
    >
      <BrandPattern variant="light" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
        <div
          className={`font-serif text-stat-number font-bold text-[var(--color-accent)] tabular-nums ${triggered ? 'stat-landed' : ''}`}
        >
          {displayValue.toLocaleString('en-US')}
        </div>
        <p className="text-stat-label uppercase tracking-widest text-[var(--color-text-secondary)] mt-2">
          {primaryLabel}
        </p>

        {secondaryLine && (
          <p className="mt-4 text-meta text-[var(--color-text-secondary)] opacity-80">
            {secondaryLine}
          </p>
        )}
      </div>
    </div>
  );
}
