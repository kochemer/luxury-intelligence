/**
 * Analytics consent plumbing.
 *
 * Stores the visitor's choice in localStorage. Amplitude (analytics and
 * session replay) only starts once this returns true — see AmplitudeInit.
 * The cookieless visit counter (VisitCounter) does not depend on it.
 *
 * Dev convenience: in development, consent is auto-granted so events
 * show up in the console without needing a banner.
 */

const STORAGE_KEY = 'li_analytics_consent_v1';

/** Fired on window when the choice changes; detail is the new ConsentValue. */
export const CONSENT_CHANGE_EVENT = 'li-consent-change';
/** Fired on window to reopen the banner (footer "Cookie settings"). */
export const CONSENT_OPEN_EVENT = 'li-consent-open';

export type ConsentValue = 'granted' | 'denied';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;

  const stored = readStored();

  if (stored === 'granted') return true;
  if (stored === 'denied') return false;

  // Dev auto-grant: set consent to granted automatically in development
  // so track() works out of the box while testing.
  if (process.env.NODE_ENV === 'development') {
    try { localStorage.setItem(STORAGE_KEY, 'granted'); } catch { /* ignore */ }
    return true;
  }

  return false;
}

/** True once the visitor has answered the banner either way. */
export function hasConsentChoice(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = readStored();
  return stored === 'granted' || stored === 'denied';
}

export function setAnalyticsConsent(value: ConsentValue): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent<ConsentValue>(CONSENT_CHANGE_EVENT, { detail: value }));
}

export function openConsentSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

/** Attribution keys written by track() (attribution.ts), only after consent. */
const ATTRIBUTION_KEYS = ['li_last_click_attrib_v1', 'li_first_touch_attrib_v1'];

/**
 * Removes what analytics stored in the browser: Amplitude's cookies and
 * localStorage keys (all start with "AMP") and our attribution keys.
 * Used when consent is withdrawn.
 */
export function clearAnalyticsStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('AMP') || ATTRIBUTION_KEYS.includes(key)) localStorage.removeItem(key);
    }
  } catch { /* ignore */ }
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.replace(/^www\./, '')}`];
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (!name || !name.startsWith('AMP')) continue;
    for (const d of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ''}`;
    }
  }
}
