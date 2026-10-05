'use client';

import { useEffect, useState } from 'react';
import {
  getAnalyticsConsent,
  hasConsentChoice,
  setAnalyticsConsent,
  clearAnalyticsStorage,
  CONSENT_OPEN_EVENT,
} from '@/lib/analytics';

/**
 * Cookie/analytics consent banner.
 * Shows to visitors who haven't made a choice, and again whenever the footer's
 * "Cookie settings" link is used. Amplitude starts only after Accept
 * (AmplitudeInit listens for the change). Declining after having accepted
 * clears Amplitude's storage and reloads so the SDK stops recording.
 * Hidden in dev on first load (consent is auto-granted there).
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' && !hasConsentChoice()) {
      setVisible(true);
    }
    const open = () => setVisible(true);
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  function handleAccept() {
    setAnalyticsConsent('granted');
    setVisible(false);
  }

  function handleDecline() {
    const wasGranted = getAnalyticsConsent();
    setAnalyticsConsent('denied');
    setVisible(false);
    if (wasGranted) {
      clearAnalyticsStorage();
      window.location.reload();
    }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--color-accent)] bg-[var(--color-deep)] text-[#E5E2DB] px-6 py-5 md:py-4"
    >
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        <p className="font-sans text-[13px] text-[#999] leading-relaxed flex-1">
          With your permission we use analytics cookies and session recordings (Amplitude, stored
          in the EU) to see how readers use the digest. Form fields are masked. No advertising, and
          your data is never sold. Without permission we only count visits anonymously, with no cookies.{' '}
          <a
            href="/about#privacy"
            className="text-[var(--color-accent)] hover:underline"
          >
            Privacy details
          </a>
          .
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDecline}
            className="font-mono text-[11px] tracking-[0.15em] uppercase text-[#666] hover:text-[#999] transition-colors px-4 py-2"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="font-mono text-[11px] tracking-[0.15em] uppercase bg-[var(--color-accent)] text-white px-5 py-2.5 rounded-[2px] hover:opacity-90 transition-opacity"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
