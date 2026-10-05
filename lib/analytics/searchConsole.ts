/**
 * Live Search Console reads for the private /analytics page (server only).
 *
 * Deliberately not the googleapis client in seo/gsc/client.ts: that package is
 * hundreds of MB and would push the Vercel function towards its 250 MB limit.
 * This does the service-account OAuth exchange with node:crypto and calls the
 * REST endpoint with fetch. Same credentials as the weekly SEO run:
 * GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY_B64, GSC_SITE_URL. Read-only scope.
 */

import { createSign } from 'node:crypto';
import { normalizePrivateKey } from '@/seo/gsc/privateKey';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface SearchDay { day: string; clicks: number; impressions: number; position: number }
export interface SearchRow { name: string; clicks: number; impressions: number; position: number }
export interface SearchData {
  daily: SearchDay[];
  totals: { clicks: number; impressions: number; position: number };
  queries: SearchRow[];
  pages: SearchRow[];
}

interface Creds { email: string; key: string; siteUrl: string }

function getCreds(): Creds | null {
  const email = process.env.GSC_CLIENT_EMAIL?.trim();
  const raw = process.env.GSC_PRIVATE_KEY_B64?.trim() || process.env.GSC_PRIVATE_KEY?.trim();
  if (!email || !raw) return null;
  return {
    email,
    key: normalizePrivateKey(raw),
    siteUrl: process.env.GSC_SITE_URL?.trim() || 'sc-domain:luxury-intel.com',
  };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

let tokenCache: { token: string; expires: number } | null = null;

async function accessToken(c: Creds): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: c.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(c.key);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

interface ApiRow { keys?: string[]; clicks?: number; impressions?: number; position?: number }

async function query(c: Creds, start: string, end: string, dimension: 'date' | 'query' | 'page', rowLimit: number): Promise<ApiRow[]> {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(c)}`, 'Content-Type': 'application/json' },
    // 'all' includes the last couple of days, which Google later revises.
    body: JSON.stringify({ startDate: start, endDate: end, dimensions: [dimension], rowLimit, type: 'web', dataState: 'all' }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Search Console ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { rows?: ApiRow[] }).rows ?? [];
}

const toRow = (r: ApiRow, name: string): SearchRow => ({
  name, clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0,
});

const byImpressions = (a: SearchRow, b: SearchRow) => b.impressions - a.impressions || b.clicks - a.clicks;

/** Null when credentials aren't configured; throws on API errors. */
export async function getSearchData(start: string, end: string): Promise<SearchData | null> {
  const c = getCreds();
  if (!c) return null;
  const [daily, queries, pages] = await Promise.all([
    query(c, start, end, 'date', 500),
    query(c, start, end, 'query', 100),
    query(c, start, end, 'page', 100),
  ]);
  const days = daily.map(r => ({ ...toRow(r, ''), day: r.keys?.[0] ?? '' })).map(({ name: _n, ...d }) => d);
  const impressions = days.reduce((s, d) => s + d.impressions, 0);
  return {
    daily: days,
    totals: {
      clicks: days.reduce((s, d) => s + d.clicks, 0),
      impressions,
      // Impression-weighted, as in seo/gsc/searchAnalytics.ts.
      position: impressions ? days.reduce((s, d) => s + d.position * d.impressions, 0) / impressions : 0,
    },
    // Google orders rows by clicks; the page lists them by impressions.
    queries: queries.map(r => toRow(r, r.keys?.[0] ?? '')).sort(byImpressions).slice(0, 10),
    pages: pages.map(r => toRow(r, (r.keys?.[0] ?? '').replace(/^https?:\/\/[^/]+/, '') || '/')).sort(byImpressions).slice(0, 10),
  };
}
