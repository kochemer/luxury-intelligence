/**
 * Cookieless, first-party visit counter (server side).
 *
 * Why it exists: Amplitude now only runs for visitors who accept the consent
 * banner (1–2 a week), so it can no longer say how many people visit. This
 * counts every visit without needing consent:
 *
 * - No cookies or browser storage, no IP address stored, no identifier that
 *   survives the day. Telling visitors apart within one UTC day uses
 *   sha256(daily salt + IP + user agent), truncated. Each day gets a random
 *   salt; salts older than yesterday are deleted, after which a stored hash
 *   can't be linked back to anyone (the approach Plausible and Fathom use).
 * - Consequence: a person is counted once per day they visit. "Visitors" over
 *   a week is the sum of daily visitors, not week-unique people.
 * - Only what's needed is kept: path, referring domain (never the full URL),
 *   country (from Vercel's geo header), device class.
 *
 * Bots: the beacon needs JavaScript, which removes most crawlers already.
 * The rest are caught by user agent (BOT_UA), plus desktop Linux — the same
 * heuristic as the Amplitude filter in seo/analytics/visitors.ts, because
 * headless Chrome in data centres reports itself as an ordinary Linux browser.
 * Bot hits are stored without a visitor hash, only so "N bots filtered" can be
 * reported.
 */

import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pageHits } from '@/lib/db/schema';
import { classifyReferrer } from '@/seo/analytics/visitors';
import type { VisitorSummary, VisitorChannel } from '@/seo/types';

export const BOT_UA =
  /bot|spider|crawl|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|python|curl|wget|axios|node-fetch|go-http|okhttp|java\/|phantom|puppeteer|playwright|selenium|scrapy|ahrefs|semrush|mj12|dataforseo|petal|yandex|baidu|360spider|bytespider|gptbot|claude|perplexity|inspectiontool|validator/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 20) return true;
  if (BOT_UA.test(ua)) return true;
  // Desktop Linux (not Android, not ChromeOS): overwhelmingly data-centre headless browsers.
  if (/X11; Linux/.test(ua) && !/Android|CrOS/.test(ua)) return true;
  return false;
}

export function deviceFromUserAgent(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Hostname of an external referrer, without www; null for none or same-site. */
export function referrerDomain(referrer: unknown, siteHost: string): string | null {
  if (typeof referrer !== 'string' || !referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    const site = siteHost.toLowerCase().replace(/^www\./, '').split(':')[0];
    if (!host || host === site) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/** A site path safe to store: no query string or fragment, bounded length. */
export function cleanPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  const p = path.split(/[?#]/)[0]!.slice(0, 200);
  if (p.startsWith('/api/') || p === '/analytics' || p.startsWith('/analytics/')) return null;
  return p.length > 1 ? p.replace(/\/+$/, '') : '/';
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

let saltCache: { day: string; salt: string } | null = null;

async function getDailySalt(day: string): Promise<string> {
  if (saltCache?.day === day) return saltCache.salt;
  const db = getDb();
  await db.execute(sql`
    insert into analytics_salts (day, salt) values (${day}, ${randomBytes(32).toString('hex')})
    on conflict (day) do nothing`);
  const rows = await db.execute(sql`select salt from analytics_salts where day = ${day}`);
  const salt = (rows.rows[0] as { salt: string } | undefined)?.salt;
  if (!salt) throw new Error('[visits] could not read daily salt');
  // Keep yesterday's for requests straddling midnight; anything older goes.
  await db.execute(sql`delete from analytics_salts where day < (${day}::date - 1)`);
  saltCache = { day, salt };
  return salt;
}

export interface HitInput {
  path: unknown;
  entry: unknown;
  referrer: unknown;
  webdriver?: unknown;
  userAgent: string | null;
  ip: string | null;
  country: string | null;
  siteHost: string;
  now?: Date;
}

/** Records one page view. Returns false if the input wasn't worth storing. */
export async function recordHit(input: HitInput): Promise<boolean> {
  const path = cleanPath(input.path);
  if (!path) return false;
  const now = input.now ?? new Date();
  const day = utcDay(now);
  const ua = input.userAgent ?? '';
  const bot = input.webdriver === true || isBotUserAgent(ua);
  const entry = input.entry === true;
  const ref = entry ? referrerDomain(input.referrer, input.siteHost) : null;
  const country = input.country && /^[A-Z]{2}$/.test(input.country) ? input.country : null;

  let visitor: string | null = null;
  if (!bot) {
    const salt = await getDailySalt(day);
    visitor = createHash('sha256').update(`${salt}|${input.ip ?? ''}|${ua}`).digest('hex').slice(0, 16);
  }

  await getDb().insert(pageHits).values({
    day,
    path,
    entry,
    channel: entry ? classifyReferrer(ref) : null,
    referrer: ref,
    country,
    device: bot ? null : deviceFromUserAgent(ua),
    visitor,
    bot,
  });
  return true;
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface Range { start: string; end: string } // inclusive YYYY-MM-DD

/**
 * Last day of Amplitude history in visit_history (see
 * scripts/backfillVisitHistory.ts). Readers add it to the counter's numbers.
 */
export const HISTORY_END = '2026-10-05';

/** Amplitude's device_type ("Apple iPhone", "Windows", "Apple iPad"...) as the counter's classes. */
export function deviceFromAmplitude(deviceType: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|tab/i.test(deviceType)) return 'tablet';
  if (/iphone|android|mobile|phone|pixel|galaxy|samsung|xiaomi|huawei|oneplus|motorola|oppo|vivo/i.test(deviceType)) return 'mobile';
  return 'desktop';
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
/** The counter stores ISO codes, Amplitude stored names; show names for both. */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code === '??' ? 'Unknown' : code;
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export interface VisitStats {
  range: Range;
  /** Sum of daily unique visitors. */
  visitors: number;
  pageviews: number;
  botsExcluded: number;
  /** pageviews is null on days nothing recorded them (before the counter, unless Amplitude had them). */
  daily: Array<{ day: string; visitors: number; pageviews: number | null }>;
  channels: Array<{ name: string; visitors: number }>;
  referrers: Array<{ name: string; visitors: number }>;
  pages: Array<{ name: string; pageviews: number }>;
  countries: Array<{ name: string; visitors: number }>;
  devices: Array<{ name: string; visitors: number }>;
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

function topList(m: Map<string, number>, limit = 15): Array<{ name: string; visitors: number }> {
  return [...m.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, visitors]) => ({ name, visitors }));
}

/**
 * Everything for a period: the cookieless counter plus, for days up to
 * HISTORY_END, the history imported from Amplitude. Both count a person once
 * per day, so they add up.
 */
export async function getVisitStats(range: Range): Promise<VisitStats> {
  const db = getDb();
  const within = sql`day between ${range.start}::date and ${range.end}::date`;
  const human = sql`${within} and not bot`;

  const [daily, bots, channels, referrers, pages, countries, devices, history] = await Promise.all([
    db.execute(sql`select day::text as day, count(distinct visitor) as visitors, count(*) as pageviews
      from page_hits where ${human} group by day order by day`),
    db.execute(sql`select count(*) as n from page_hits where ${within} and bot`),
    db.execute(sql`select channel as name, count(distinct (day, visitor)) as visitors
      from page_hits where ${human} and entry and channel is not null group by channel`),
    db.execute(sql`select referrer as name, count(distinct (day, visitor)) as visitors
      from page_hits where ${human} and entry and referrer is not null group by referrer`),
    db.execute(sql`select path as name, count(*) as pageviews
      from page_hits where ${human} group by path order by 2 desc limit 15`),
    db.execute(sql`select coalesce(country, '??') as name, count(distinct (day, visitor)) as visitors
      from page_hits where ${human} group by 1`),
    db.execute(sql`select coalesce(device, 'unknown') as name, count(distinct (day, visitor)) as visitors
      from page_hits where ${human} group by 1`),
    db.execute(sql`select day::text as day, dim, value, n from visit_history where ${within}`),
  ]);

  const dayMap = new Map<string, { visitors: number; pageviews: number | null }>();
  const dayEntry = (day: string) => {
    let d = dayMap.get(day);
    if (!d) dayMap.set(day, d = { visitors: 0, pageviews: null });
    return d;
  };
  for (const r of daily.rows as Row[]) {
    const d = dayEntry(String(r.day));
    d.visitors += num(r.visitors);
    d.pageviews = (d.pageviews ?? 0) + num(r.pageviews);
  }

  const merged = {
    channel: new Map<string, number>(),
    referrer: new Map<string, number>(),
    country: new Map<string, number>(),
    device: new Map<string, number>(),
  };
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  for (const r of channels.rows as Row[]) bump(merged.channel, String(r.name), num(r.visitors));
  for (const r of referrers.rows as Row[]) bump(merged.referrer, String(r.name), num(r.visitors));
  for (const r of countries.rows as Row[]) bump(merged.country, countryName(String(r.name)), num(r.visitors));
  for (const r of devices.rows as Row[]) bump(merged.device, String(r.name), num(r.visitors));

  let historyBots = 0;
  for (const r of history.rows as Row[]) {
    const day = String(r.day), dim = String(r.dim), value = String(r.value), n = num(r.n);
    if (dim === 'visitors') dayEntry(day).visitors += n;
    else if (dim === 'pageviews') { const d = dayEntry(day); d.pageviews = (d.pageviews ?? 0) + n; }
    else if (dim === 'bots') historyBots += n;
    else if (dim in merged) bump(merged[dim as keyof typeof merged], value, n);
  }

  const dailyRows = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, d]) => ({ day, ...d }));

  return {
    range,
    visitors: dailyRows.reduce((s, d) => s + d.visitors, 0),
    pageviews: dailyRows.reduce((s, d) => s + (d.pageviews ?? 0), 0),
    botsExcluded: num((bots.rows[0] as Row | undefined)?.n) + historyBots,
    daily: dailyRows,
    channels: topList(merged.channel),
    referrers: topList(merged.referrer),
    pages: (pages.rows as Row[]).map(r => ({ name: String(r.name), pageviews: num(r.pageviews) })),
    countries: topList(merged.country),
    devices: topList(merged.device),
  };
}

/** First day the counter has data for, or null if it has none. */
export async function getCounterStartDay(): Promise<string | null> {
  const rows = await getDb().execute(sql`select min(day)::text as d from page_hits`);
  const d = (rows.rows[0] as Row | undefined)?.d;
  return d ? String(d) : null;
}

/** The N complete UTC days ending yesterday, and the N before. */
export function lastDays(n: number, now = new Date()): { current: Range; previous: Range } {
  const dayMs = 86_400_000;
  const y = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dayMs;
  const d = (t: number) => new Date(t).toISOString().slice(0, 10);
  return {
    current: { start: d(y - (n - 1) * dayMs), end: d(y) },
    previous: { start: d(y - (2 * n - 1) * dayMs), end: d(y - n * dayMs) },
  };
}

/** The N days ending today (today partial), and the N before. For live views. */
export function daysEndingToday(n: number, now = new Date()): { current: Range; previous: Range } {
  return lastDays(n, new Date(now.getTime() + 86_400_000));
}

/** Every day in a range, so charts show zero days instead of skipping them. */
export function eachDay(range: Range): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${range.start}T00:00:00Z`); t <= Date.parse(`${range.end}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * The weekly email's visitor section, from the counter. Null when there's no
 * database or the counter has nothing for the last 7 days yet, so the caller
 * can fall back to Amplitude.
 */
export async function getCounterVisitorSummary(now = new Date()): Promise<VisitorSummary | null> {
  if (!process.env.DATABASE_URL) return null;
  const startDay = await getCounterStartDay();
  const { current, previous } = lastDays(7, now);
  if (!startDay || startDay > current.end) return null;

  const [cur, prev] = await Promise.all([
    getVisitStats(current),
    startDay <= previous.end ? getVisitStats(previous) : Promise.resolve(null),
  ]);

  return {
    source: 'counter',
    ...(startDay > current.start ? { countingSince: startDay } : {}),
    window: current,
    people: cur.visitors,
    previousPeople: prev ? prev.visitors : null,
    botsExcluded: cur.botsExcluded,
    channels: cur.channels.map(c => ({ channel: c.name as VisitorChannel, visitors: c.visitors })),
    referrers: cur.referrers.slice(0, 6).map(r => ({ domain: r.name, visitors: r.visitors })),
  };
}
