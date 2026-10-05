'use client';

import { useEffect } from 'react';
import * as amplitude from '@amplitude/unified';
import {
  getAnalyticsConsent,
  track,
  CONSENT_CHANGE_EVENT,
  type ConsentValue,
} from '@/lib/analytics';

/**
 * Starts Amplitude (analytics + session replay) — but only for visitors who
 * accepted the consent banner. Nothing loads, no cookies are set and nothing
 * is recorded before that. Visitors who decline are still counted, anonymously
 * and without cookies, by VisitCounter.
 *
 * Withdrawing consent (footer "Cookie settings" → Decline) is handled by
 * ConsentBanner: it clears Amplitude's storage and reloads, so the SDK is gone.
 */

let initialized = false;

function initAmplitude(): boolean {
  if (initialized) return true;

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || '2f72d6d40500d170bda25421e23d7975';

  // In development, skip initialization to avoid network errors interfering with navigation
  if (process.env.NODE_ENV === 'development') {
    console.info('[Amplitude] Skipped initialization in development mode');
    initialized = true;
    return true;
  }

  // The SDK logs noisy errors while starting; hide only Amplitude's for a moment.
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const s = args.join(' ');
    if (s.includes('amplitude') || s.includes('Amplitude') || s.includes('Destination')) return;
    originalConsoleError.apply(console, args);
  };
  const restore = () => { console.error = originalConsoleError; };
  setTimeout(restore, 2000);

  try {
    void amplitude.initAll(apiKey, {
      serverZone: 'EU',
      analytics: {
        // Don't store visitors' IP addresses in Amplitude.
        trackingOptions: { ipAddress: false },
        autocapture: {
          // Page views are fired manually via AnalyticsPageView — disable auto to avoid duplicates.
          pageViews: false,
          // Sessions managed by Amplitude internally.
          sessions: true,
          // Element interactions disabled: noisy, risks capturing form field values (PII).
          elementInteractions: false,
        },
      },
      sessionReplay: {
        sampleRate: 1,
        // Mask everything typed into form fields (e.g. the subscribe email box).
        privacyConfig: { defaultMaskLevel: 'medium' },
      },
    }).catch(() => { /* network/SDK errors are non-critical */ });
    initialized = true;
    return true;
  } catch (error: unknown) {
    console.warn('[Amplitude] initialization warning (non-critical):', (error as Error)?.message || error);
    restore();
    return false;
  }
}

export default function AmplitudeInit() {
  useEffect(() => {
    if (getAnalyticsConsent()) initAmplitude();

    function onConsentChange(e: Event) {
      const value = (e as CustomEvent<ConsentValue>).detail;
      if (value !== 'granted' || initialized) return;
      if (initAmplitude()) {
        // The page view for the page they accepted on was skipped (no consent yet) — send it now.
        track('page_view', { page_title: document.title });
      }
    }

    window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onConsentChange);
  }, []);

  return null;
}
