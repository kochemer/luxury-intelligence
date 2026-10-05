/**
 * Who actually visited: the other half of the measurement loop.
 *
 * Search Console says what Google did with the site (impressions, clicks).
 * This says what happened after: how many people arrived and from where.
 * Read from Amplitude's Dashboard REST API, read-only, once a week.
 *
 * Three facts about the data shape this module, all found by probing the
 * account on 2026-10-04 rather than assumed:
 *
 * 1. Count Amplitude's automatic session activity (`_active`), not the site's
 *    own `page_view`. Until 2026-10-05 session tracking covered everyone;
 *    since the consent fix Amplitude only runs for visitors who accept
 *    cookies, so this is now the fallback. The primary source is the
 *    cookieless counter (lib/analytics/visits.ts, getCounterVisitorSummary).
 *
 * 2. Most "visitors" are bots. Of 143 in 28 days, 71 were Baidu's renderer and
 *    360Spider, and most US traffic was HeadlessChrome / desktop-Linux browsers
 *    in data-centre cities (San Jose, Boardman, Ashburn). Unfiltered, the
 *    report would show crawler noise as growth. The filter below is a
 *    heuristic: it removes known bot signatures and desktop Linux, which costs
 *    the rare real Linux reader in exchange for removing nearly all the noise.
 *
 * 3. Source comes from the `gp:referring_domain` user property that
 *    Amplitude's web attribution sets. No referrer means direct, a bookmark,
 *    an email client, or an app that strips referrers. It is not "unknown bots"
 *    once the filter has run.
 *
 * Numbers are small (5–16 people a week), so they are reported weekly and
 * never used to trigger alerts or automated decisions.
 */

import type { VisitorSummary, VisitorChannel } from '../types';

/** Public by design: it is the browser key already shipped in the page. */
const DEFAULT_PUBLIC_KEY = '2f72d6d40500d170bda25421e23d7975';

const BASE_URL: Record<string, string> = {
  EU: 'https://analytics.eu.amplitude.com/api/2',
  US: 'https://amplitude.com/api/2',
};

/**
 * Applied to every query. Amplitude's `os` field holds the browser string on
 * web, which is where crawler names appear; `device_type` carries "Linux" for
 * desktop Linux.
 */
export const HUMAN_FILTERS = [
  {
    subprop_type: 'user',
    subprop_key: 'os',
    subprop_op: 'does not contain',
    subprop_value: ['spider', 'Spider', 'bot', 'Bot', 'Headless', 'indexer', 'crawler', 'Crawler'],
  },
  { subprop_type: 'user', subprop_key: 'device_type', subprop_op: 'is not', subprop_value: ['Linux'] },
];

const CHANNEL_RULES: Array<{ channel: VisitorChannel; match: RegExp }> = [
  // AI assistants first: some (e.g. Google's Gemini) live on search domains.
  { channel: 'AI assistants', match: /chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google|copilot\.microsoft|bing\.com\/chat|claude\.ai|you\.com|poe\.com/i },
  { channel: 'Search', match: /google\.|googlequicksearchbox|bing\.com|duckduckgo|yahoo\.|ecosia|brave\.com|mamma\.com|baidu\.|yandex\.|qwant\./i },
  { channel: 'LinkedIn', match: /linkedin\.com|lnkd\.in/i },
  { channel: 'Teams / Outlook', match: /cloud\.microsoft|teams\.|outlook\.|office\.com|office365|live\.com/i },
  { channel: 'Other social', match: /facebook\.|instagram\.|x\.com|twitter\.|t\.co$|reddit\.|youtube\.|youtu\.be|threads\.net|pinterest\./i },
];

/** Map a referring domain to a plain-language channel. */
export function classifyReferrer(domain: string | null | undefined): VisitorChannel {
  const d = (domain ?? '').trim();
  if (!d || d === '(none)' || d === 'EMPTY' || d === '(empty)') return 'Direct / email';
  for (const rule of CHANNEL_RULES) if (rule.match.test(d)) return rule.channel;
  return 'Other sites';
}

interface Window { start: Date; end: Date }

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The last 7 complete days, and the 7 days before them. */
export function weeklyWindows(now = new Date()): { current: Window; previous: Window } {
  const day = 86_400_000;
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - day);
  const current = { start: new Date(yesterday.getTime() - 6 * day), end: yesterday };
  const previous = { start: new Date(current.start.getTime() - 7 * day), end: new Date(current.start.getTime() - day) };
  return { current, previous };
}

interface SegmentationData {
  series: number[][];
  seriesCollapsed: Array<Array<{ value: number }>>;
  seriesLabels: Array<string | [number, string]>;
  xValues?: string[];
}

function getConfig(): { auth: string; base: string } | null {
  const secret = process.env.AMPLITUDE_SECRET_KEY?.trim();
  if (!secret) return null;
  const apiKey = process.env.AMPLITUDE_API_KEY?.trim()
    || process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim()
    || DEFAULT_PUBLIC_KEY;
  const zone = (process.env.AMPLITUDE_SERVER_ZONE ?? 'EU').trim().toUpperCase();
  return {
    auth: 'Basic ' + Buffer.from(`${apiKey}:${secret}`).toString('base64'),
    base: BASE_URL[zone] ?? BASE_URL.EU!,
  };
}

async function segmentation(
  cfg: { auth: string; base: string },
  window: Window,
  options: { filters?: unknown[]; groupBy?: string; eventType?: string; metric?: 'uniques' | 'totals' } = {},
): Promise<SegmentationData> {
  const event: Record<string, unknown> = { event_type: options.eventType ?? '_active' };
  if (options.filters) event.filters = options.filters;
  if (options.groupBy) event.group_by = [{ type: 'user', value: options.groupBy }];

  const params = new URLSearchParams({
    e: JSON.stringify(event),
    m: options.metric ?? 'uniques',
    start: ymd(window.start),
    end: ymd(window.end),
    i: '1',
  });
  const res = await fetch(`${cfg.base}/events/segmentation?${params}`, {
    headers: { Authorization: cfg.auth },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Amplitude ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()).data as SegmentationData;
}

/** Unique people over the whole window (deduplicated by Amplitude, not summed per day). */
function collapsedTotal(data: SegmentationData, index = 0): number {
  return data.seriesCollapsed?.[index]?.[0]?.value ?? 0;
}

/**
 * Pull last week's visitors. Returns null when no secret key is configured, so
 * the weekly report simply omits the section; throws on API errors so the
 * caller can log them and carry on without it.
 */
export async function getVisitorSummary(now = new Date()): Promise<VisitorSummary | null> {
  const cfg = getConfig();
  if (!cfg) return null;

  const { current, previous } = weeklyWindows(now);

  // Sequential: Amplitude's REST API is rate-limited per project, and five
  // small queries a week need no concurrency.
  const people = await segmentation(cfg, current, { filters: HUMAN_FILTERS });
  const prevPeople = await segmentation(cfg, previous, { filters: HUMAN_FILTERS });
  const everyone = await segmentation(cfg, current);
  const byReferrer = await segmentation(cfg, current, { filters: HUMAN_FILTERS, groupBy: 'gp:referring_domain' });

  const referrers = byReferrer.seriesLabels
    .map((label, i) => ({
      domain: Array.isArray(label) ? label[1] : label,
      visitors: collapsedTotal(byReferrer, i),
    }))
    .filter(r => r.visitors > 0);

  const channelTotals = new Map<VisitorChannel, number>();
  for (const r of referrers) {
    const ch = classifyReferrer(r.domain);
    channelTotals.set(ch, (channelTotals.get(ch) ?? 0) + r.visitors);
  }

  const peopleCount = collapsedTotal(people);
  return {
    source: 'amplitude',
    window: { start: iso(current.start), end: iso(current.end) },
    people: peopleCount,
    previousPeople: collapsedTotal(prevPeople),
    botsExcluded: Math.max(0, collapsedTotal(everyone) - peopleCount),
    channels: [...channelTotals.entries()]
      .map(([channel, visitors]) => ({ channel, visitors }))
      .sort((a, b) => b.visitors - a.visitors),
    referrers: referrers
      .filter(r => classifyReferrer(r.domain) !== 'Direct / email')
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 6),
  };
}

/**
 * Totals of the site's own events over a window, plus how many (consenting,
 * bot-filtered) people were active. For the private /analytics page. Null
 * without a secret key; throws on API errors.
 */
export async function getEventTotals(
  events: readonly string[],
  window: { start: Date; end: Date },
): Promise<{ people: number; events: Array<{ event: string; total: number }> } | null> {
  const cfg = getConfig();
  if (!cfg) return null;
  // Sequential for the same rate-limit reason as above.
  const people = collapsedTotal(await segmentation(cfg, window, { filters: HUMAN_FILTERS }));
  const totals: Array<{ event: string; total: number }> = [];
  for (const event of events) {
    try {
      const data = await segmentation(cfg, window, { eventType: event, metric: 'totals' });
      totals.push({ event, total: collapsedTotal(data) });
    } catch (err) {
      // Amplitude rejects an event type it has never received; that's a zero.
      if (err instanceof Error && /Invalid chart definition/.test(err.message)) totals.push({ event, total: 0 });
      else throw err;
    }
  }
  return { people, events: totals };
}

/**
 * Bot-filtered people per day, for the /analytics chart's history before the
 * cookieless counter existed (until 2026-10-05 Amplitude saw every visitor).
 * Null without a secret key; throws on API errors.
 */
export async function getDailyPeople(
  window: { start: Date; end: Date },
): Promise<Array<{ day: string; people: number }> | null> {
  const cfg = getConfig();
  if (!cfg) return null;
  const data = await segmentation(cfg, window, { filters: HUMAN_FILTERS });
  return (data.xValues ?? []).map((day, i) => ({ day: day.slice(0, 10), people: data.series[0]?.[i] ?? 0 }));
}
