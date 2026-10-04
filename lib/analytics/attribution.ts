/**
 * Last-click attribution — persisted in localStorage.
 *
 * Rules (from measurement-plan.md §5):
 *   1. UTMs on the URL override everything (becomes last click).
 *   2. Else if referrer exists and differs from stored, overwrite.
 *   3. Else return stored (or direct).
 */

const STORAGE_KEY = 'li_last_click_attrib_v1';
const FIRST_TOUCH_KEY = 'li_first_touch_attrib_v1';

export interface LastClickAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  acq_channel_last_click: string;
  acq_source_last_click?: string;
  acq_medium_last_click?: string;
  acq_campaign_last_click?: string;
  referrer_domain?: string;
}

export interface FirstTouchAttribution {
  acq_channel_first_touch: string;
  acq_source_first_touch?: string;
  acq_medium_first_touch?: string;
  acq_campaign_first_touch?: string;
}

// Checked before search engines: Gemini lives on a google.com subdomain.
const AI_ASSISTANTS = [
  'chatgpt.com', 'openai.com', 'perplexity.ai', 'gemini.google', 'copilot.microsoft',
  'claude.ai', 'you.com', 'poe.com',
];
const SEARCH_ENGINES = ['google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'ecosia', 'search.brave.com', 'brave.com'];
const SOCIAL_DOMAINS = [
  'facebook', 'instagram', 'tiktok', 'x.com', 'twitter', 't.co', // t.co = Twitter link shortener
  'linkedin', 'lnkd.in',                                           // lnkd.in = LinkedIn shortener
  'reddit', 'youtube', 'youtu.be',                                 // youtu.be = YouTube shortener
  'threads.net', 'pinterest',
];

function domainContains(domain: string, list: string[]): boolean {
  const d = domain.toLowerCase();
  return list.some(s => d.includes(s));
}

function inferChannel(medium: string | undefined, referrerDomain: string | undefined): string {
  if (medium) {
    const m = medium.toLowerCase();
    if (/cpc|ppc|paidsearch/.test(m)) return 'paid_search';
    if (/paid_social|paidsocial/.test(m)) return 'paid_social';
    if (/social/.test(m)) return 'organic_social';
    if (/email/.test(m)) return 'email';
    if (/display|banner/.test(m)) return 'display';
    return 'other';
  }
  if (referrerDomain) {
    if (domainContains(referrerDomain, AI_ASSISTANTS)) return 'ai_assistant';
    if (domainContains(referrerDomain, SEARCH_ENGINES)) return 'search';
    if (domainContains(referrerDomain, SOCIAL_DOMAINS)) return 'organic_social';
    return 'referral';
  }
  return 'direct';
}

function readStored(): LastClickAttribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastClickAttribution;
  } catch {
    return null;
  }
}

function writeStored(a: LastClickAttribution): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch { /* quota / private mode — ignore */ }
}

function extractReferrerDomain(): string | undefined {
  try {
    const ref = document.referrer;
    if (!ref) return undefined;
    const host = new URL(ref).hostname.replace(/^www\./, '');
    if (host === window.location.hostname) return undefined;
    return host || undefined;
  } catch {
    return undefined;
  }
}

function buildAttribution(
  utms: Record<string, string | undefined>,
  referrerDomain: string | undefined,
): LastClickAttribution {
  const channel = inferChannel(utms.utm_medium, referrerDomain);
  return {
    ...(utms.utm_source && { utm_source: utms.utm_source }),
    ...(utms.utm_medium && { utm_medium: utms.utm_medium }),
    ...(utms.utm_campaign && { utm_campaign: utms.utm_campaign }),
    ...(utms.utm_content && { utm_content: utms.utm_content }),
    ...(utms.utm_term && { utm_term: utms.utm_term }),
    acq_channel_last_click: channel,
    acq_source_last_click: utms.utm_source || referrerDomain || undefined,
    acq_medium_last_click: utms.utm_medium || undefined,
    acq_campaign_last_click: utms.utm_campaign || undefined,
    referrer_domain: referrerDomain,
  };
}

/**
 * First-touch attribution — written once on the visitor's first hit, never overwritten.
 * Accepts the just-resolved last-click attribution so we don't duplicate the resolution logic.
 */
export function getFirstTouchAttribution(lastClick: LastClickAttribution): FirstTouchAttribution {
  if (typeof window === 'undefined') {
    return { acq_channel_first_touch: 'unknown' };
  }
  try {
    const stored = localStorage.getItem(FIRST_TOUCH_KEY);
    if (stored) return JSON.parse(stored) as FirstTouchAttribution;
  } catch { /* quota / private mode */ }

  // First visit — derive from last-click (they're the same on first hit)
  const first: FirstTouchAttribution = {
    acq_channel_first_touch: lastClick.acq_channel_last_click,
    ...(lastClick.acq_source_last_click   && { acq_source_first_touch:   lastClick.acq_source_last_click }),
    ...(lastClick.acq_medium_last_click   && { acq_medium_first_touch:   lastClick.acq_medium_last_click }),
    ...(lastClick.acq_campaign_last_click && { acq_campaign_first_touch: lastClick.acq_campaign_last_click }),
  };
  try {
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(first));
  } catch { /* quota / private mode */ }
  return first;
}

export function getLastClickAttribution(): LastClickAttribution {
  if (typeof window === 'undefined') {
    return { acq_channel_last_click: 'unknown' };
  }

  const params = new URLSearchParams(window.location.search);
  const utms: Record<string, string | undefined> = {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_term: params.get('utm_term') || undefined,
  };
  const hasUtms = Object.values(utms).some(Boolean);
  const referrerDomain = extractReferrerDomain();

  if (hasUtms) {
    const attrib = buildAttribution(utms, referrerDomain);
    writeStored(attrib);
    return attrib;
  }

  const stored = readStored();

  if (referrerDomain && referrerDomain !== stored?.referrer_domain) {
    const attrib = buildAttribution({}, referrerDomain);
    writeStored(attrib);
    return attrib;
  }

  if (stored) return stored;

  const fallback: LastClickAttribution = { acq_channel_last_click: 'direct' };
  writeStored(fallback);
  return fallback;
}
