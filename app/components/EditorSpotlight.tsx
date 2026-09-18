'use client';

/**
 * EditorSpotlight — weekly first-person editorial opinion column.
 *
 * Styled as a newspaper column: left-rule accent, open prose, compact attribution.
 * Fades in on scroll intersection. Respects prefers-reduced-motion.
 *
 * Renders the `editorialTake` field from the digest JSON.
 * Content is AI-drafted; can be manually overridden (editorialTakeOverride flag).
 */

import { useRef, useState, useEffect } from 'react';

type EditorSpotlightProps = {
  text: string;
  weekLabel?: string;
  /** True when the curator has manually written or edited this take */
  isOverride?: boolean;
};

export function EditorSpotlight({ text, weekLabel, isOverride = false }: EditorSpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`my-8 md:my-10 transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div
        className="border-l-2 border-[var(--color-accent)] pl-5 sm:pl-6 md:pl-8 py-1"
        style={{ background: 'linear-gradient(to right, rgba(139, 105, 20, 0.05), transparent 55%)' }}
      >
        <div className="flex items-center gap-3 mb-4 md:mb-5">
          <span className="font-mono text-[10px] tracking-[0.32em] uppercase text-[var(--color-accent)] whitespace-nowrap">
            Editor&apos;s Spotlight
          </span>
          <span
            className="flex-1 block h-px opacity-25"
            style={{ background: 'var(--color-accent)' }}
            aria-hidden="true"
          />
          {isOverride && (
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[var(--color-text-secondary)] opacity-50">
              edited
            </span>
          )}
        </div>

        {/* .speakable-take is referenced by the NewsArticle `speakable` cssSelector in lib/seo/jsonLd.ts */}
        <div className="speakable-take mb-5 md:mb-6 space-y-4">
          {text.split('\n\n').map((para, i) => (
            <p key={i} className="font-serif text-[1.0rem] sm:text-[1.0625rem] md:text-[1.125rem] leading-[1.78] text-[var(--color-text-primary)]">
              {para.trim()}
            </p>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-text-secondary)] opacity-60">
            The Editor
          </span>
          {weekLabel && (
            <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-[var(--color-text-secondary)] opacity-35 select-none">
              {weekLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
