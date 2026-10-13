'use client';

import { useState, useEffect, useRef } from 'react';

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animate a number from 0 to `end` over `duration` ms using easeOutExpo.
 * Starts when `trigger` becomes true. Respects prefers-reduced-motion.
 *
 * The value starts at `end`, not 0, so server HTML, crawlers, no-JS readers
 * and slow hydration show the real number (it used to ship "0 articles
 * analysed"). The count-up only replays once the element is triggered.
 */
export function useCountUp(end: number, duration = 1200, trigger = false): number {
  const [value, setValue] = useState(end);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!trigger || end <= 0) return;

    if (prefersReducedMotion()) {
      setValue(end);
      return;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.round(end * easeOutExpo(progress)));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trigger, end, duration]);

  return value;
}
