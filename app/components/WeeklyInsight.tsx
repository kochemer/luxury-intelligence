'use client';

import { useRef, useState, useEffect } from 'react';

/** wide: the homepage's full-width pull-quote row (wider measure, larger type). */
export function WeeklyInsight({ quote, wide = false }: { quote: string; wide?: boolean }) {
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
      className={`relative ${wide ? 'w-full px-6 sm:px-10 md:px-16 lg:px-24' : 'max-w-2xl mx-auto px-6 sm:px-10 md:px-16'} py-8 sm:py-10 md:py-16 text-center transition-all duration-[600ms] ease-out ${
        revealed ? 'translate-y-0' : 'translate-y-2'
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
      <p className={`speakable-insight font-serif italic text-[var(--color-text-primary)] tracking-[-0.01em] relative text-balance ${wide ? 'text-[1.25rem] md:text-[1.625rem] lg:text-[2rem] xl:text-[2.25rem] leading-snug' : 'text-[1.125rem] md:text-[1.375rem] leading-relaxed'}`}>
        {quote}
      </p>

      {/* Closing mark — decorative, bottom-right */}
      <span
        className="absolute bottom-12 right-2 md:right-4 font-serif text-[3.5rem] md:text-[5rem] leading-none text-[var(--color-accent)] opacity-30 select-none pointer-events-none"
        aria-hidden="true"
      >
        &rdquo;
      </span>

      <hr className={`mt-10 border-[var(--color-border)] ${wide ? 'max-w-none -ml-6 w-[calc(100%+3rem)] sm:-ml-10 sm:w-[calc(100%+5rem)] md:-ml-16 md:w-[calc(100%+8rem)] lg:-ml-24 lg:w-[calc(100%+12rem)]' : 'max-w-xs mx-auto'}`} />
    </div>
  );
}
