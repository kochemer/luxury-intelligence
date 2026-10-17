/**
 * Pure maths for the Amplitude sections of /analytics: no network, no clock
 * (callers pass `today`). Kept apart from lib/analytics/amplitude.ts so it can
 * be unit-tested with synthetic data.
 *
 * Two facts shape it, both found by probing the live account (see
 * docs/superpowers/specs/2026-10-16-analytics-amplitude-design.md):
 *
 * - Attribution comes from the landing page's full URL, never from the
 *   `utm_*` / `acq_*` event properties. The site stamps the last UTM a visitor
 *   ever clicked onto every later event, so those are wrong after a first visit.
 * - Time on site is replay length. Amplitude's own session length scores a
 *   one-page visit as 0 s.
 */

export const AMPLITUDE_PROJECT_ID = '100038173';

/** First full day with the consent gate (it took effect during 2026-10-05). */
export const CONSENT_START = '2026-10-06';

/** Replays are kept 30 days, so per-person data reaches back 29 days from today. */
export const REPLAY_DAYS = 30;

/** At most this many people get a per-person lookup (one API call each). */
export const PEOPLE_CAP = 60;

// ---------------------------------------------------------------- types

export interface Replay { replayId: string; sessionId: string; deviceId: string; amplitudeId: string; start: string; end: string }

export interface ActivityEvent { time: string; type: string; sessionId: string; props: Record<string, unknown>; country: string | null; city: string | null; deviceType: string | null }
export interface UserActivity { firstSeen: string | null; os: string | null; device: string | null; country: string | null; city: string | null; events: ActivityEvent[] }

export interface VisitSession {
  replayId: string; personId: string;              // personId = amplitude id (server-side only use)
  start: string; durationS: number;                // replay end − start, rounded seconds
  pages: number; paths: string[];                  // page_view route_path values in order
  cameFrom: { kind: 'tagged' | 'site' | 'direct'; label: string; detail?: string };
  country: string | null; city: string | null; device: string | null;
  firstSeen: string | null; firstVisit: boolean;   // firstVisit: firstSeen === session start day
  actions: Array<'subscribed' | 'digest' | 'article'>;
}
export interface ReturningStats { people: number; visitedBefore: number; firstVisit: number; cameBackAnotherDay: number; d7: { eligible: number; back: number } }
export interface EngagementStats { sessions: number; pageviews: number; pagesPerVisit: number | null; medianDurationS: number | null; over3min: number; buckets: Array<{ label: string; count: number }> }
export interface ConsentedVisits { window: { start: string; end: string }; replayWindow: { start: string; end: string }; sessions: VisitSession[]; returning: ReturningStats; engagement: EngagementStats; sampled: boolean }
export interface TaggedLanding { source: string; medium: string; campaign: string; content: string; path: string; people: number; visits: number }
export interface TaggedLandings { window: { start: string; end: string }; social: TaggedLanding[]; other: TaggedLanding[] }
export type VitalMetric = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
export interface VitalStat { samples: number; p75: number | null; good: number; needsWork: number; poor: number; rating: 'good' | 'needs-work' | 'poor' | null; sampled: boolean } // shares 0–1
export interface WebVitals { window: { start: string; end: string }; metrics: Record<VitalMetric, VitalStat> }

export interface SegmentGroup { label: string; series: number[]; total: number }
export interface SegmentResult { days: string[]; groups: SegmentGroup[]; hitGroupLimit: boolean }

// ---------------------------------------------------------------- days

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function intersect(range: { start: string; end: string }, lo: string, hi: string): { start: string; end: string } | null {
  const start = range.start > lo ? range.start : lo;
  const end = range.end < hi ? range.end : hi;
  return start > end ? null : { start, end };
}

/** range ∩ [CONSENT_START, today]; null if empty. */
export function amplitudeWindow(range: { start: string; end: string }, today = utcToday()): { start: string; end: string } | null {
  return intersect(range, CONSENT_START, today);
}

/** window ∩ [today − 29, today]: the days a replay can still exist for. */
export function replayWindowFor(window: { start: string; end: string }, today = utcToday()): { start: string; end: string } | null {
  return intersect(window, addDays(today, -(REPLAY_DAYS - 1)), today);
}

// ---------------------------------------------------------------- segmentation parsing

interface RawSegmentation {
  xValues?: string[];
  series?: number[][];
  seriesLabels?: unknown[];
  seriesCollapsed?: Array<Array<{ value?: number }>>;
}

/** Amplitude labels: `[0,"value"]` grouped, `"a; b"` for two group-bys, `[0]` or `0` ungrouped. */
export function segmentLabel(raw: unknown, fallback: string): string {
  if (Array.isArray(raw)) return raw.length >= 2 ? String(raw[1]) : fallback;
  if (typeof raw === 'string') return raw;
  return fallback;
}

export function parseSegmentation(data: RawSegmentation | undefined, fallbackLabel: string, grouped: boolean, limit: number): SegmentResult {
  const series = data?.series ?? [];
  const groups = series.map((s, i) => {
    const sum = s.reduce((a, b) => a + (Number(b) || 0), 0);
    return {
      label: segmentLabel(data?.seriesLabels?.[i], fallbackLabel),
      series: s.map(v => Number(v) || 0),
      total: data?.seriesCollapsed?.[i]?.[0]?.value ?? sum,
    };
  });
  return {
    days: (data?.xValues ?? []).map(x => String(x).slice(0, 10)),
    groups,
    hitGroupLimit: grouped && groups.length >= limit,
  };
}

// ---------------------------------------------------------------- numbers

/** Median; mean of the two middle values for an even count; null when empty. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// ---------------------------------------------------------------- web vitals

/** Google's thresholds: at or below `good` is good, above `poor` is poor. */
export const VITAL_THRESHOLDS: Record<VitalMetric, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

export const VITAL_METRICS = Object.keys(VITAL_THRESHOLDS) as VitalMetric[];

export function rateVital(metric: VitalMetric, value: number): 'good' | 'needs-work' | 'poor' {
  const t = VITAL_THRESHOLDS[metric];
  if (value <= t.good) return 'good';
  return value <= t.poor ? 'needs-work' : 'poor';
}

/** p75 and good / needs-work / poor shares from `[value, count]` pairs. */
export function vitalFromCounts(metric: VitalMetric, pairs: Array<[number, number]>, sampled = false): VitalStat {
  const rows = pairs
    .filter(([v, c]) => Number.isFinite(v) && Number.isFinite(c) && c > 0)
    .sort((a, b) => a[0] - b[0]);
  const samples = rows.reduce((a, [, c]) => a + c, 0);
  if (samples === 0) return { samples: 0, p75: null, good: 0, needsWork: 0, poor: 0, rating: null, sampled };
  const t = VITAL_THRESHOLDS[metric];
  let cum = 0;
  let p75 = rows[rows.length - 1]![0];
  for (const [v, c] of rows) {
    cum += c;
    if (cum >= 0.75 * samples) { p75 = v; break; }
  }
  let good = 0;
  let poor = 0;
  for (const [v, c] of rows) {
    if (v <= t.good) good += c;
    else if (v > t.poor) poor += c;
  }
  return {
    samples,
    p75,
    good: good / samples,
    needsWork: (samples - good - poor) / samples,
    poor: poor / samples,
    rating: rateVital(metric, p75),
    sampled,
  };
}

/** Turn a group-by-value segmentation into `[value, count]` pairs; skips labels like '(none)'. */
export function vitalPairs(result: SegmentResult): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const g of result.groups) {
    const label = g.label.trim();
    if (label === '' || !Number.isFinite(Number(label))) continue;
    out.push([Number(label), g.total]);
  }
  return out;
}

// ---------------------------------------------------------------- tagged landings

export interface ParsedTag { source: string; medium: string; campaign: string; content: string; path: string }

/** Pull the utm tags and path out of a full landing URL; null if it isn't one. */
export function parseTaggedUrl(url: string): ParsedTag | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const q = u.searchParams;
  return {
    source: q.get('utm_source') ?? '',
    medium: q.get('utm_medium') ?? '',
    campaign: q.get('utm_campaign') ?? '',
    content: q.get('utm_content') ?? '',
    path: u.pathname,
  };
}

/**
 * Merge people (uniques) and visits (totals) per landing URL into one row per
 * distinct tag set, social split from the rest. Summing people across URLs
 * that differ only in untracked query params can double count one person; the
 * numbers are tiny and read as people per link, not a site total.
 */
export function mergeTaggedRows(
  people: Array<{ label: string; total: number }>,
  visits: Array<{ label: string; total: number }>,
): { social: TaggedLanding[]; other: TaggedLanding[] } {
  const rows = new Map<string, TaggedLanding>();
  const add = (list: Array<{ label: string; total: number }>, field: 'people' | 'visits') => {
    for (const { label, total } of list) {
      const tag = parseTaggedUrl(label);
      if (!tag) continue;
      const key = [tag.source, tag.medium, tag.campaign, tag.content, tag.path].join('|');
      const row = rows.get(key) ?? { ...tag, people: 0, visits: 0 };
      row[field] += total;
      rows.set(key, row);
    }
  };
  add(people, 'people');
  add(visits, 'visits');
  const all = [...rows.values()].sort((a, b) => b.visits - a.visits || b.people - a.people);
  return {
    social: all.filter(r => r.medium === 'social'),
    other: all.filter(r => r.medium !== 'social'),
  };
}

// ---------------------------------------------------------------- sessions

const BOT_OS = /spider|bot|headless|indexer|crawler/i;

/** Same heuristic as HUMAN_FILTERS in seo/analytics/visitors.ts. */
export function isBotPerson(a: Pick<UserActivity, 'os' | 'device'>): boolean {
  return BOT_OS.test(a.os ?? '') || a.device === 'Linux';
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Where one visit came from, judged by its first page view only (see file header). */
export function cameFromPageView(props: Record<string, unknown>): VisitSession['cameFrom'] {
  const location = str(props['[Amplitude] Page Location']);
  if (location) {
    try {
      const q = new URL(location).searchParams;
      const source = q.get('utm_source');
      if (source) {
        return {
          kind: 'tagged',
          label: source,
          detail: [q.get('utm_campaign'), q.get('utm_content')].filter(Boolean).join(' · '),
        };
      }
    } catch { /* not a full URL: fall through */ }
  }
  if (props['[Amplitude] Previous Page Type'] === 'external') {
    try {
      const host = new URL(str(props['[Amplitude] Previous Page Location'])).hostname.replace(/^www\./, '');
      if (host) return { kind: 'site', label: host };
    } catch { /* no usable previous page: direct */ }
  }
  return { kind: 'direct', label: 'Direct / email / app' };
}

/**
 * One VisitSession per replay, from that person's events with the same
 * session id. People who look like bots are dropped.
 */
export function buildSessions(replays: Replay[], activity: Map<string, UserActivity>): VisitSession[] {
  const out: VisitSession[] = [];
  for (const r of replays) {
    const a = activity.get(r.amplitudeId);
    if (!a || isBotPerson(a)) continue;
    const events = a.events
      .filter(e => String(e.sessionId) === String(r.sessionId))
      .sort((x, y) => x.time.localeCompare(y.time));
    const views = events.filter(e => e.type === 'page_view');
    const types = new Set(events.map(e => e.type));
    const actions: VisitSession['actions'] = [];
    if (types.has('checkout_start') || types.has('checkout_complete')) actions.push('subscribed');
    if (types.has('digest_view')) actions.push('digest');
    if (types.has('article_click')) actions.push('article');
    const first = events[0];
    out.push({
      replayId: r.replayId,
      personId: r.amplitudeId,
      start: r.start,
      durationS: Math.max(0, Math.round((Date.parse(r.end) - Date.parse(r.start)) / 1000)),
      pages: views.length,
      paths: views.map(v => str(v.props.route_path)).filter(Boolean),
      cameFrom: views[0] ? cameFromPageView(views[0].props) : { kind: 'direct', label: 'Direct / email / app' },
      country: first?.country ?? a.country,
      city: first?.city ?? a.city,
      device: first?.deviceType ?? a.device,
      firstSeen: a.firstSeen,
      firstVisit: a.firstSeen === r.start.slice(0, 10),
      actions,
    });
  }
  return out;
}

// ---------------------------------------------------------------- returning and engagement

/** Returning-reader counts over sessions that fall in `replayWindow`. */
export function returningStats(sessions: VisitSession[], replayWindow: { start: string; end: string }, today = utcToday()): ReturningStats {
  const people = new Map<string, { firstSeen: string | null; days: Set<string> }>();
  for (const s of sessions) {
    const p = people.get(s.personId) ?? { firstSeen: s.firstSeen, days: new Set<string>() };
    p.days.add(s.start.slice(0, 10));
    people.set(s.personId, p);
  }
  const out: ReturningStats = { people: people.size, visitedBefore: 0, firstVisit: 0, cameBackAnotherDay: 0, d7: { eligible: 0, back: 0 } };
  const cutoff = addDays(today, -7);
  for (const p of people.values()) {
    if (p.days.size >= 2) out.cameBackAnotherDay++;
    const f = p.firstSeen;
    if (!f) continue;
    if (f < replayWindow.start) { out.visitedBefore++; continue; }
    if (f > replayWindow.end) continue;
    out.firstVisit++;
    if (f <= cutoff) {
      out.d7.eligible++;
      const last = addDays(f, 7);
      if ([...p.days].some(d => d > f && d <= last)) out.d7.back++;
    }
  }
  return out;
}

const BUCKETS: Array<{ label: string; max: number }> = [
  { label: 'Under 10 s', max: 10 },
  { label: '10–30 s', max: 30 },
  { label: '30 s – 1 min', max: 60 },
  { label: '1–3 min', max: 180 },
  { label: '3–10 min', max: 600 },
  { label: 'Over 10 min', max: Infinity },
];

export function engagementStats(sessions: VisitSession[]): EngagementStats {
  const buckets = BUCKETS.map(b => ({ label: b.label, count: 0 }));
  for (const s of sessions) {
    const i = BUCKETS.findIndex(b => s.durationS < b.max);
    buckets[i]!.count++;
  }
  const pageviews = sessions.reduce((a, s) => a + s.pages, 0);
  const med = median(sessions.map(s => s.durationS));
  return {
    sessions: sessions.length,
    pageviews,
    pagesPerVisit: sessions.length ? Math.round((pageviews / sessions.length) * 10) / 10 : null,
    medianDurationS: med === null ? null : Math.round(med),
    over3min: sessions.filter(s => s.durationS >= 180).length,
    buckets,
  };
}
