/**
 * Pure helpers that turn Amplitude's raw group labels into the few families a
 * sentence can use ("LinkedIn", "Edge", "English", a topic tile's name). Kept
 * apart from facts.ts so they are testable without Amplitude or a database.
 */

import { getMessages } from '@/lib/i18n/messages';

export const REFERRER_FAMILIES = [
  'LinkedIn', 'Viva Engage', 'Teams / Outlook', 'Search', 'AI assistants',
  'Other social', 'No referrer', 'Other sites',
] as const;
export type ReferrerFamily = typeof REFERRER_FAMILIES[number];

/** Host of an Amplitude referring-domain value, lower case, no scheme, path or "www.". */
function host(domain: string): string {
  return domain.trim().toLowerCase().replace(/^[a-z-]+:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
}

/** The canonical name of an AI assistant's domain, or null. */
export function aiAssistantName(domain: string): string | null {
  const h = host(domain);
  if (h === 'chatgpt.com' || h.endsWith('.chatgpt.com')) return 'chatgpt.com';
  if (h === 'openai.com' || h.endsWith('.openai.com')) return 'openai.com';
  if (h === 'perplexity.ai' || h.endsWith('.perplexity.ai')) return 'perplexity.ai';
  if (h.startsWith('gemini.google')) return 'gemini.google';
  if (h.startsWith('copilot.microsoft')) return 'copilot.microsoft';
  if (h === 'claude.ai' || h.endsWith('.claude.ai')) return 'claude.ai';
  return null;
}

const SEARCH_HOSTS = ['googlequicksearchbox', 'bing.com', 'duckduckgo', 'yahoo.', 'ecosia', 'search.brave', 'brave.com', 'baidu', 'yandex'];
const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'instagram.com', 't.co', 'twitter.com', 'x.com', 'reddit.com', 'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.', 'whatsapp.com', 'bsky.app', 'threads.net', 'mastodon'];

export function referrerFamily(domain: string | null | undefined): ReferrerFamily {
  const raw = (domain ?? '').trim();
  if (!raw || /^(empty|\(none\)|none|null|undefined|direct|-)$/i.test(raw)) return 'No referrer';
  const h = host(raw);
  if (h === 'linkedin.com' || h.endsWith('.linkedin.com') || h === 'com.linkedin.android' || h === 'lnkd.in' || h.endsWith('.lnkd.in')) return 'LinkedIn';
  if (h === 'web.yammer.com' || h === 'yammer.com' || h.endsWith('.yammer.com') || h === 'engage.cloud.microsoft') return 'Viva Engage';
  if (h.startsWith('teams.') || h === 'statics.teams.cdn.office.net' || h.startsWith('outlook.') || h === 'office.com' || h.endsWith('.office.com') || h === 'live.com' || h.endsWith('.live.com')) return 'Teams / Outlook';
  if (aiAssistantName(h)) return 'AI assistants';
  if (h.startsWith('google.') || h.includes('googlequicksearchbox') || SEARCH_HOSTS.some(s => h.includes(s))) return 'Search';
  if (SOCIAL_HOSTS.some(s => h === s || h.endsWith(`.${s}`) || (s.endsWith('.') && h.includes(s)) || (s === 'mastodon' && h.includes(s)))) return 'Other social';
  return 'Other sites';
}

/** "Edge 148" -> "Edge". Amplitude's `os` property is browser + version. */
export function browserFamily(os: string | null | undefined): string {
  const name = (os ?? '').trim().replace(/\s+v?\d[\d.]*$/, '').trim();
  return name && !/^(empty|\(none\)|unknown|null)$/i.test(name) ? name : 'Unknown';
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** "en-GB", "en_US", "en" and "English" all become "English". */
export function languageName(label: string | null | undefined): string {
  const raw = (label ?? '').trim();
  if (!raw || /^(empty|\(none\)|unknown|null)$/i.test(raw)) return 'Unknown';
  const code = raw.match(/^([a-z]{2,3})(?:[-_][A-Za-z0-9]+)*$/);
  if (code) {
    try { return languageNames.of(code[1]!) ?? raw; } catch { return raw; }
  }
  return raw.replace(/\s*\(.*\)$/, '');
}

/** Lower-case ascii id part: "Ecommerce & Retail Tech" -> "ecommerce-retail-tech", "/" -> "home". */
export function slug(s: string): string {
  const out = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || 'home';
}

const TOPIC_KEYS = ['ecommerceRetailTech', 'jewelleryIndustry', 'aiStrategy', 'fashionLuxury'] as const;

/** Every topic tile name in every locale, with the English name it stands for; longest first. */
function topicLabels(): Array<{ label: string; english: string }> {
  const en = getMessages('en').categories;
  const out: Array<{ label: string; english: string }> = [];
  for (const locale of ['en', 'da', 'es'] as const) {
    const c = getMessages(locale).categories;
    for (const k of TOPIC_KEYS) out.push({ label: c[k].toLowerCase(), english: en[k] });
  }
  return out.sort((a, b) => b.label.length - a.label.length);
}

/**
 * The English topic name a dead click's element text belongs to. The text can
 * be the tile's name followed by its description, in any locale; null when the
 * element is not a topic tile.
 */
export function topicName(elementText: string | null | undefined): string | null {
  const t = (elementText ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  return topicLabels().find(l => t.startsWith(l.label))?.english ?? null;
}
