/**
 * Amplitude reads for /analytics (EU Dashboard REST and Session Replay APIs,
 * read-only). Auth mirrors seo/analytics/visitors.ts: the public browser key
 * plus AMPLITUDE_SECRET_KEY.
 *
 * Amplitude only sees visitors who accept cookies, so every panel starts at
 * CONSENT_START and per-person data (replays, user activity) reaches back at
 * most 30 days. The maths lives in amplitudeStats.ts; this file is I/O and
 * has no cache (the page wraps the loaders in unstable_cache).
 */

import { HUMAN_FILTERS } from '@/seo/analytics/visitors';
import {
  PEOPLE_CAP,
  VITAL_METRICS,
  amplitudeWindow,
  buildSessions,
  engagementStats,
  mergeTaggedRows,
  parseSegmentation,
  replayWindowFor,
  returningStats,
  utcToday,
  vitalFromCounts,
  vitalPairs,
  type ActivityEvent,
  type ConsentedVisits,
  type Replay,
  type SegmentResult,
  type TaggedLandings,
  type UserActivity,
  type VitalMetric,
  type VitalStat,
  type WebVitals,
} from './amplitudeStats';

// Types, constants (AMPLITUDE_PROJECT_ID, CONSENT_START) and pure helpers.
export * from './amplitudeStats';

/** Public by design: it is the browser key already shipped in the page. */
const DEFAULT_PUBLIC_KEY = '2f72d6d40500d170bda25421e23d7975';
const BASE_URL = 'https://analytics.eu.amplitude.com/api';
const TIMEOUT_MS = 30_000;
const MAX_IN_FLIGHT = 3;
// 429s are per Amplitude project, not per process, so back off generously.
const RETRY_WAITS_MS = [2000, 4000, 8000, 16_000, 30_000];
const JITTER = 0.2;                 // +/-20% on every wait
const MAX_RETRY_AFTER_MS = 60_000;  // cap for a Retry-After header

export function amplitudeConfigured(): boolean {
  return Boolean(process.env.AMPLITUDE_SECRET_KEY?.trim());
}

// Amplitude rate-limits by concurrency (429 seen at 4+ parallel), so every
// request in the process shares one small semaphore.
let inFlight = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) { inFlight++; return; }
  await new Promise<void>(resolve => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next(); // hand the slot straight over, in-flight count unchanged
  else inFlight--;
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
let sleep: (ms: number) => Promise<void> = realSleep;

/** Test hook: replace the back-off sleep (pass nothing to restore). */
export function __setSleepForTests(fn?: (ms: number) => Promise<void>): void {
  sleep = fn ?? realSleep;
}

/** Wait before retry `attempt` (0-based): Retry-After if sent (capped), else the schedule; jittered. */
export function retryDelayMs(attempt: number, retryAfter: string | null, random: () => number = Math.random): number {
  let base = RETRY_WAITS_MS[Math.min(attempt, RETRY_WAITS_MS.length - 1)]!;
  if (retryAfter != null && retryAfter.trim() !== '') {
    const secs = Number(retryAfter);
    const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(ms) && ms >= 0) base = Math.min(ms, MAX_RETRY_AFTER_MS);
  }
  const jittered = base * (1 + (random() * 2 - 1) * JITTER);
  return Math.round(Math.min(jittered, MAX_RETRY_AFTER_MS));
}

export async function amplitudeGet<T = unknown>(path: string, params: Record<string, string | string[]> = {}): Promise<T> {
  const secret = process.env.AMPLITUDE_SECRET_KEY?.trim();
  if (!secret) throw new Error('Amplitude: AMPLITUDE_SECRET_KEY is not set');
  const apiKey = process.env.AMPLITUDE_API_KEY?.trim()
    || process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim()
    || DEFAULT_PUBLIC_KEY;
  const auth = 'Basic ' + Buffer.from(`${apiKey}:${secret}`).toString('base64');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item);
  }
  const query = qs.toString();
  const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;

  // The slot is held only while a request is in flight; it is released while
  // sleeping between 429 retries so a waiting request does not block others.
  for (let attempt = 0; ; attempt++) {
    await acquire();
    let res: Response;
    let held = true;
    try {
      res = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 429 && attempt < RETRY_WAITS_MS.length) {
        release();
        held = false;
        await res.body?.cancel().catch(() => {});
        await sleep(retryDelayMs(attempt, res.headers.get('retry-after')));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Amplitude ${res.status}: ${body.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    } finally {
      if (held) release();
    }
  }
}

// ---------------------------------------------------------------- segmentation

export interface SegmentQuery {
  event: string; start: string; end: string;        // YYYY-MM-DD inclusive
  metric?: 'uniques' | 'totals';                    // default uniques
  interval?: 1 | 7 | 30;                            // default 1
  groupBy?: Array<{ type: 'event' | 'user'; value: string }>; // max 2
  filters?: unknown[];                              // default HUMAN_FILTERS; pass [] for none
  limit?: number;                                   // group-by row limit, default 100
}

const ymd = (day: string) => day.replace(/-/g, '');

export async function segment(q: SegmentQuery): Promise<SegmentResult> {
  const limit = q.limit ?? 100;
  const grouped = Boolean(q.groupBy?.length);
  const event: Record<string, unknown> = { event_type: q.event, filters: q.filters ?? HUMAN_FILTERS };
  if (grouped) event.group_by = q.groupBy;
  const res = await amplitudeGet<{ data?: Parameters<typeof parseSegmentation>[0] }>('/2/events/segmentation', {
    e: JSON.stringify(event),
    m: q.metric ?? 'uniques',
    start: ymd(q.start),
    end: ymd(q.end),
    i: String(q.interval ?? 1),
    limit: String(limit),
  });
  return parseSegmentation(res.data, q.event, grouped, limit);
}

// ---------------------------------------------------------------- replays and people

interface RawReplay {
  replay_id: string; session_id: string | number; device_id: string; amplitude_id: number | string;
  start_time: string; end_time: string;
}

const utcIso = (t: string) => (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`);

/** Newest first, all pages. Every consented session has a replay (sampling is 1). */
export async function listReplays(startDay: string, endDay: string): Promise<Replay[]> {
  const out: Replay[] = [];
  let token: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await amplitudeGet<{ session_replays?: RawReplay[]; next_page_token?: string | null }>(
      '/1/session-replays',
      {
        start_time: `${startDay}T00:00:00Z`,
        end_time: `${endDay}T23:59:59Z`,
        sort_order: 'desc',
        ...(token ? { page_token: token } : {}),
      },
    );
    for (const r of res.session_replays ?? []) {
      out.push({
        replayId: r.replay_id,
        sessionId: String(r.session_id),
        deviceId: r.device_id,
        amplitudeId: String(r.amplitude_id),
        start: utcIso(r.start_time),
        end: utcIso(r.end_time),
      });
    }
    if (!res.next_page_token || res.next_page_token === token) break;
    token = res.next_page_token;
  }
  return out;
}

interface RawActivity {
  userData?: { first_used?: string; os?: string; device?: string; country?: string; city?: string };
  events?: Array<{
    event_time: string; event_type: string; session_id: number | string;
    event_properties?: Record<string, unknown>; country?: string; city?: string; device_type?: string;
  }>;
}

/** "2026-10-13 06:31:05.840000" (UTC) to "2026-10-13T06:31:05.840Z". */
function activityTime(t: string): string {
  const [d, rest = '00:00:00'] = t.trim().split(' ');
  const [hms = '00:00:00', frac = ''] = rest.split('.');
  return `${d}T${hms}.${(frac + '000').slice(0, 3)}Z`;
}

export async function getUserActivity(amplitudeId: string): Promise<UserActivity> {
  const res = await amplitudeGet<RawActivity>('/2/useractivity', { user: amplitudeId, limit: '1000' });
  const u = res.userData ?? {};
  const events: ActivityEvent[] = (res.events ?? []).map(e => ({
    time: activityTime(e.event_time),
    type: e.event_type,
    sessionId: String(e.session_id),
    props: e.event_properties ?? {},
    country: e.country || null,
    city: e.city || null,
    deviceType: e.device_type || null,
  }));
  return {
    firstSeen: u.first_used?.slice(0, 10) || null,
    os: u.os || null,
    device: u.device || null,
    country: u.country || null,
    city: u.city || null,
    events,
  };
}

/** Presigned file URLs for one replay, all pages. */
export async function getReplayFileUrls(replayId: string): Promise<string[]> {
  const urls: string[] = [];
  let token: string | undefined;
  for (let page = 0; page < 100; page++) {
    const res = await amplitudeGet<{ files?: string[]; next_page_token?: string | null }>(
      '/1/session-replays/files',
      { replay_id: replayId, ...(token ? { page_token: token } : {}) },
    );
    urls.push(...(res.files ?? []));
    if (!res.next_page_token || res.next_page_token === token) break;
    token = res.next_page_token;
  }
  return urls;
}

// ---------------------------------------------------------------- loaders

type Range = { start: string; end: string };

export async function getConsentedVisits(range: Range, today = utcToday()): Promise<ConsentedVisits | null> {
  const window = amplitudeWindow(range, today);
  if (!window) return null;
  const replayWindow = replayWindowFor(window, today);
  if (!replayWindow) return null; // the whole period is older than the 30 days replays are kept

  const replays = await listReplays(replayWindow.start, replayWindow.end);
  const ids = [...new Set(replays.map(r => r.amplitudeId))]; // newest person first
  const sampled = ids.length > PEOPLE_CAP;
  const keep = new Set(ids.slice(0, PEOPLE_CAP));

  const activity = new Map<string, UserActivity>();
  await Promise.all([...keep].map(async id => { activity.set(id, await getUserActivity(id)); }));

  const sessions = buildSessions(replays.filter(r => keep.has(r.amplitudeId)), activity);
  return {
    window,
    replayWindow,
    sessions,
    returning: returningStats(sessions, replayWindow, today),
    engagement: engagementStats(sessions),
    sampled,
  };
}

export async function getCoverage(range: Range, today = utcToday()): Promise<{ window: Range; personDays: number } | null> {
  const window = amplitudeWindow(range, today);
  if (!window) return null;
  const r = await segment({ event: '_active', start: window.start, end: window.end });
  const personDays = r.groups.reduce((a, g) => a + g.series.reduce((x, y) => x + y, 0), 0);
  return { window, personDays };
}

export async function getTaggedLandings(range: Range, today = utcToday()): Promise<TaggedLandings | null> {
  const window = amplitudeWindow(range, today);
  if (!window) return null;
  const query = {
    event: 'page_view',
    start: window.start,
    end: window.end,
    filters: [
      ...HUMAN_FILTERS,
      { subprop_type: 'event', subprop_key: '[Amplitude] Page Location', subprop_op: 'contains', subprop_value: ['utm_'] },
    ],
    groupBy: [{ type: 'event' as const, value: '[Amplitude] Page Location' }],
    limit: 200,
  };
  const people = await segment({ ...query, metric: 'uniques' });
  const visits = await segment({ ...query, metric: 'totals' });
  return { window, ...mergeTaggedRows(people.groups, visits.groups) };
}

const NO_DATA: VitalStat = { samples: 0, p75: null, good: 0, needsWork: 0, poor: 0, rating: null, sampled: false };

/** Not clamped to consent: the range is used as given. */
export async function getWebVitals(range: Range): Promise<WebVitals> {
  const metrics = {} as Record<VitalMetric, VitalStat>;
  for (const m of VITAL_METRICS) {
    try {
      const r = await segment({
        event: '[Amplitude] Web Vitals',
        start: range.start,
        end: range.end,
        metric: 'totals',
        interval: 30,
        groupBy: [{ type: 'event', value: `[Amplitude] ${m}.value` }],
        limit: 1000,
      });
      metrics[m] = vitalFromCounts(m, vitalPairs(r), r.hitGroupLimit);
    } catch (e) {
      // 400 = the event or property doesn't exist in this window: no measurements yet.
      if (e instanceof Error && e.message.startsWith('Amplitude 400')) metrics[m] = { ...NO_DATA };
      else throw e;
    }
  }
  return { window: range, metrics };
}
