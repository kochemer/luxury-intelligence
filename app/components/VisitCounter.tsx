'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Sends one anonymous beacon per page view to /api/hit — for every visitor,
 * consent or not. It sets no cookies and stores nothing in the browser; see
 * lib/analytics/visits.ts for what the server keeps.
 */
export default function VisitCounter() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  const sentEntryRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;
    if (!pathname || pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;

    const entry = !sentEntryRef.current;
    sentEntryRef.current = true;
    const payload = JSON.stringify({
      p: pathname,
      e: entry,
      r: entry ? document.referrer : undefined,
      w: navigator.webdriver === true,
    });

    try {
      if (!navigator.sendBeacon?.('/api/hit', payload)) {
        void fetch('/api/hit', { method: 'POST', body: payload, keepalive: true }).catch(() => {});
      }
    } catch {
      // Never let counting affect the page.
    }
  }, [pathname]);

  return null;
}
