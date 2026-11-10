/**
 * Stage 1: deterministic hard filters (pure).
 * Spec: docs/superpowers/specs/2026-11-10-selection-funnel-design.md §1
 *
 * Drops sponsored / press-release / advertorial items by URL path token, wire
 * source or title label. Matches whole tokens only, never substrings
 * (the legacy "ad" substring penalised "trade", "head", "already").
 */
import type { Article } from '../lib/types';
import type { HardFilterResult } from './types';

/** URL path segments / slug tokens that mark paid or PR content. Hyphen-joined; compared token-wise. */
export const SPONSORED_PATH_MARKERS = [
  'sponsored',
  'sponsor-content',
  'partner-content',
  'partnercontent',
  'paid-post',
  'paidpost',
  'brandvoice',
  'brand-studio',
  'brandstudio',
  'advertorial',
  'branded-content',
  'native-ad',
  'press-release',
  'press-releases',
  'pressrelease',
  'newswire',
  'promoted-content',
  'sponsored-content',
  // Dive Brands (Retail Dive, Grocery Dive...) serve paid posts under /spons/ (found in W45 triage smoke)
  'spons',
];

/** Wire domains (host equals or is a subdomain of). */
const PR_WIRE_DOMAINS = [
  'prnewswire.com',
  'businesswire.com',
  'globenewswire.com',
  'einpresswire.com',
  'accesswire.com',
  'prweb.com',
  'newsfilecorp.com',
  'newsfile.com',
  'pr.com',
  'openpr.com',
];

/** Normalised (letters+digits only) source names; long ones match by substring, short ones exactly. */
const PR_WIRE_SOURCES_CONTAINS = ['prnewswire', 'businesswire', 'globenewswire', 'einpresswire', 'einnewspresswire'];
const PR_WIRE_SOURCES_EXACT = ['accesswire', 'prweb', 'newsfile', 'newsfilecorp', 'prcom', 'openpr'];

const LABEL = 'sponsored(?:\\s+(?:content|post))?|advertorial|partner\\s+content|paid\\s+post|promoted';
// Bracketed label, or label followed by a separator / end of title. "Promoted to CEO" and
// "Sponsored athletes ..." do not match because the separator is required.
const TITLE_LABEL_RE = new RegExp(
  `^\\s*(?:[\\[(]\\s*(${LABEL})\\s*[\\])]|(${LABEL})\\s*(?:[:|\\u2013\\u2014-]|$))`,
  'i',
);

/** Soft-flag / disclosure phrases, whole-phrase matched. */
export const DISCLOSURE_PHRASES = [
  'sponsored by',
  'in partnership with',
  'brought to you by',
  'paid partnership',
  'affiliate',
  'we may earn a commission',
  'presented by',
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DISCLOSURE_RES = DISCLOSURE_PHRASES.map(p => ({
  phrase: p,
  re: new RegExp(`(?<![a-z0-9])${escapeRe(p).replace(/ /g, '\\s+')}(?![a-z0-9])`, 'i'),
}));

/** Disclosure phrases found in free text (title, snippet or full body). Whole-phrase, case-insensitive. */
export function scanDisclosures(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const { phrase, re } of DISCLOSURE_RES) {
    if (re.test(text)) found.push(phrase);
  }
  return found;
}

function tokenize(segment: string): string[] {
  return segment
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when markerTokens occur as a contiguous run inside tokens. */
function hasRun(tokens: string[], markerTokens: string[]): boolean {
  outer: for (let i = 0; i + markerTokens.length <= tokens.length; i++) {
    for (let j = 0; j < markerTokens.length; j++) {
      if (tokens[i + j] !== markerTokens[j]) continue outer;
    }
    return true;
  }
  return false;
}

const MARKER_TOKENS = SPONSORED_PATH_MARKERS.map(m => ({ marker: m, tokens: tokenize(m), joined: m.replace(/-/g, '') }));

/** Marker reason for a URL path, or null. Segment equality (with or without hyphens) or contiguous slug tokens. */
function pathMarker(url: string): string | null {
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0];
  }
  const segments = pathname.split('/').filter(Boolean);
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    const tokens = tokenize(lower);
    const joinedSeg = tokens.join('');
    for (const m of MARKER_TOKENS) {
      if (lower === m.marker || joinedSeg === m.joined || hasRun(tokens, m.tokens)) return m.marker;
    }
  }
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function wireSourceReason(article: { url: string; source?: string }): string | null {
  const host = hostOf(article.url);
  if (host && PR_WIRE_DOMAINS.some(d => host === d || host.endsWith('.' + d))) return 'source:pr-wire';
  const norm = (article.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (norm) {
    if (PR_WIRE_SOURCES_EXACT.includes(norm)) return 'source:pr-wire';
    if (PR_WIRE_SOURCES_CONTAINS.some(s => norm.includes(s))) return 'source:pr-wire';
  }
  return null;
}

export function hardFilter(article: Pick<Article, 'url' | 'title' | 'source' | 'snippet'>): HardFilterResult {
  const reasons: string[] = [];

  const marker = pathMarker(article.url || '');
  if (marker) reasons.push(`url:${marker}`);

  const wire = wireSourceReason(article);
  if (wire) reasons.push(wire);

  const m = TITLE_LABEL_RE.exec(article.title || '');
  if (m) {
    const label = (m[1] || m[2]).toLowerCase().replace(/\s+/g, '-');
    reasons.push(`label:${label}`);
  }

  const softFlags = scanDisclosures(`${article.title || ''}\n${article.snippet || ''}`).map(
    p => `text:${p.replace(/\s+/g, '-')}`,
  );

  return { url: article.url, drop: reasons.length > 0, reasons, softFlags };
}
