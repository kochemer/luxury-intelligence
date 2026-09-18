'use client';

import { useRef, useState, useEffect } from 'react';

export function WeeklyInsight({ quote }: { quote: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`relative max-w-2xl mx-auto px-6 sm:px-10 md:px-16 py-8 sm:py-10 md:py-16 text-center transition-all duration-[600ms] ease-out ${
        revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {/* Opening mark — decorative, top-left, does not affect text flow */}
      <span
        className="absolute top-6 left-2 md:left-4 font-serif text-[3.5rem] md:text-[5rem] leading-none text-[var(--color-accent)] opacity-30 select-none pointer-events-none"
        aria-hidden="true"
      >
        &ldquo;
      </span>

      {/* .speakable-insight is referenced by the NewsArticle `speakable` cssSelector in lib/seo/jsonLd.ts */}
      <p className="speakable-insight font-serif italic text-[1.125rem] md:text-[1.375rem] leading-relaxed text-[var(--color-text-primary)] tracking-[-0.01em] relative">
        {quote}
      </p>

      {/* Closing mark — decorative, bottom-right */}
      <span
        className="absolute bottom-12 right-2 md:right-4 font-serif text-[3.5rem] md:text-[5rem] leading-none text-[var(--color-accent)] opacity-30 select-none pointer-events-none"
        aria-hidden="true"
      >
        &rdquo;
      </span>

      <hr className="mt-10 border-[var(--color-border)] max-w-xs mx-auto" />
    </div>
  );
}
