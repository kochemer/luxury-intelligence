'use client';

import { useSyncExternalStore } from 'react';

export const VALID_N_VALUES = [3, 4, 5, 6, 7] as const;
export const DEFAULT_N = 7;
export type TopNValue = (typeof VALID_N_VALUES)[number];

const EVENT = 'topn-change';

export function isValidN(value: number | null | undefined): value is TopNValue {
  return value !== null && value !== undefined && VALID_N_VALUES.includes(value as TopNValue);
}

function parseN(raw: string | null): TopNValue | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return isValidN(parsed) ? parsed : null;
}

/** ?n= if valid, else the saved choice, else the default. Browser only. */
function readN(): TopNValue {
  const fromUrl = parseN(new URLSearchParams(window.location.search).get('n'));
  if (fromUrl) return fromUrl;
  try {
    const stored = parseN(localStorage.getItem('topN'));
    if (stored) return stored;
  } catch {
    // localStorage may be blocked
  }
  return DEFAULT_N;
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * The "top N per category" setting.
 *
 * Deliberately NOT built on useSearchParams: that hook makes a prerendered page
 * client-render everything up to the nearest Suspense boundary, which would
 * empty the digest articles out of the static HTML. The server (and the first
 * client render) always use DEFAULT_N, so the HTML has the full default view;
 * after hydration the real value (?n=, then localStorage) is read from the URL.
 */
export function useTopN(): TopNValue {
  return useSyncExternalStore(subscribe, readN, () => DEFAULT_N);
}

/** Persist a choice, put it in the URL (?n= omitted for the default) and notify every useTopN. */
export function setTopN(n: TopNValue) {
  try {
    localStorage.setItem('topN', String(n));
  } catch {
    // ignore
  }
  const url = new URL(window.location.href);
  if (n === DEFAULT_N) url.searchParams.delete('n');
  else url.searchParams.set('n', String(n));
  window.history.pushState(null, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new Event(EVENT));
}
