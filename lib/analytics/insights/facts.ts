/**
 * The data pack the weekly insights agent reads: aggregates only, as flat
 * facts with stable ids ("amp.people.week.2026-05-18"). No replays, no
 * per-person rows, no raw events.
 *
 * Facts are built at the granularity a sentence needs, because the checks
 * (checks.ts) accept no arithmetic beyond a percentage: if a tile should say
 * "LinkedIn brought N people in the busiest week", that exact number has to be
 * a fact here.
 *
 * Each source loads in its own block. A block that fails (Amplitude answers
 * HTTP 400 for an event with no data, GSC credentials missing, no database) is
 * logged and skipped; the pack is built from the rest. Progress goes to stderr
 * so `--print-pack` can write clean JSON to stdout.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  CONSENT_START, amplitudeGet, getWebVitals, segment, type SegmentResult,
} from '@/lib/analytics/amplitude';
import { getCounterStartDay, getVisitStats, lastDays } from '@/lib/analytics/visits';
import { getSearchData } from '@/lib/analytics/searchConsole';
import {
  aiAssistantName, browserFamily, languageName, referrerFamily, slug, topicName,
  REFERRER_FAMILIES,
} from './families';
import type { DataPack, Fact, InsightSource, Period, SeriesFact } from './types';

const YEAR_START = '2026-01-01';
/** First Monday of 2026: the first full week. */
const FIRST_WEEK = '2026-01-05';
const ACTIVE = '_active';

const log = (msg: string) => console.error(`[insights:pack] ${msg}`);

// ── Dates ────────────────────────────────────────────────────────────────────

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monthStart = (ym: string) => `${ym}-01`;
const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const monthsBetween = (fromDay: string, toDay: string): string[] => {
  const out: string[] = [];
  let [y, m] = fromDay.slice(0, 7).split('-').map(Number) as [number, number];
  const last = toDay.slice(0, 7);
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (ym > last) return out;
    out.push(ym);
    if (++m > 12) { m = 1; y++; }
  }
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => `${MONTH_NAMES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// ── Collector ────────────────────────────────────────────────────────────────

class Pack {
  facts = new Map<string, Fact>();
  series = new Map<string, SeriesFact>();
  failed: string[] = [];

  fact(id: string, label: string, period: Period, value: number, source: InsightSource) {
    if (!Number.isFinite(value)) return;
    if (this.facts.has(id) || this.series.has(id)) { log(`duplicate id ${id}, keeping the first`); return; }
    this.facts.set(id, { id, label, period, value, source });
  }

  addSeries(id: string, label: string, period: Period, points: Array<{ key: string; value: number }>, source: InsightSource) {
    if (this.facts.has(id) || this.series.has(id)) { log(`duplicate id ${id}, keeping the first`); return; }
    this.series.set(id, { id, label, period, points: points.filter(p => Number.isFinite(p.value)), source });
  }

  async block<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    const t0 = Date.now();
    try {
      const out = await fn();
      log(`${name} ok (${Date.now() - t0} ms)`);
      return out;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 160);
      log(`${name} FAILED: ${msg}`);
      this.failed.push(`${name}: ${msg}`);
      return null;
    }
  }
}

/** Group label -> Amplitude's deduplicated total for that group. */
function groupTotals(r: SegmentResult): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of r.groups) m.set(g.label, (m.get(g.label) ?? 0) + g.total);
  return m;
}

function sumBy(totals: Map<string, number>, key: (label: string) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [label, n] of totals) out.set(key(label), (out.get(key(label)) ?? 0) + n);
  return out;
}

const top = (m: Map<string, number>, n: number) =>
  [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

interface Week { start: string; end: string; people: number }

// ── Amplitude, before the consent change (every visitor counted) ─────────────

async function amplitudeWeekly(p: Pack, histEnd: string): Promise<Week[]> {
  const weeks: string[] = [];
  for (let w = FIRST_WEEK; addDays(w, 6) <= histEnd; w = addDays(w, 7)) weeks.push(w);
  if (weeks.length === 0) return [];
  const range = { start: weeks[0]!, end: addDays(weeks[weeks.length - 1]!, 6) };
  const r = await segment({ event: ACTIVE, start: range.start, end: range.end, interval: 7 });
  const g = r.groups[0];
  if (!g || g.series.length !== r.days.length) throw new Error('weekly series came back empty or misaligned');
  const out: Week[] = r.days.map((d, i) => {
    const start = d.slice(0, 10);
    return { start, end: addDays(start, 6), people: g.series[i]! };
  });
  for (const w of out) {
    p.fact(`amp.people.week.${w.start}`, `People (unique, all visitors) in the week starting ${w.start}`, { start: w.start, end: w.end }, w.people, 'amplitude');
  }
  p.addSeries('amp.people.weekly', 'People per week (unique, all visitors), full weeks of 2026 before the cookie banner', range,
    out.map(w => ({ key: w.start, value: w.people })), 'amplitude');
  p.fact('amp.people.week.median', 'Median people per week (full weeks, all visitors)', range, median(out.map(w => w.people)), 'amplitude');
  return out;
}

async function amplitudeMonthly(p: Pack, histEnd: string) {
  const months = monthsBetween(YEAR_START, histEnd).filter(ym => monthEnd(ym) <= histEnd);
  const results = await Promise.all(months.map(async ym => {
    const r = await segment({ event: ACTIVE, start: monthStart(ym), end: monthEnd(ym) });
    return [ym, r.groups[0]?.total ?? 0] as const;
  }));
  for (const [ym, n] of results) {
    p.fact(`amp.people.month.${ym}`, `People (unique, all visitors) in ${monthLabel(ym)}`, { start: monthStart(ym), end: monthEnd(ym) }, n, 'amplitude');
  }
  if (results.length >= 2) {
    p.addSeries('amp.people.monthly', 'People per month (unique, all visitors)', { start: monthStart(months[0]!), end: monthEnd(months[months.length - 1]!) },
      results.map(([ym, n]) => ({ key: monthStart(ym), value: n })), 'amplitude');
  }
  const year = await segment({ event: ACTIVE, start: YEAR_START, end: histEnd });
  p.fact('amp.people.year.2026', 'People (unique, all visitors) from 1 Jan 2026 until the cookie banner', { start: YEAR_START, end: histEnd }, year.groups[0]?.total ?? 0, 'amplitude');
}

async function amplitudeTopWeeks(p: Pack, weeks: Week[]) {
  const biggest = [...weeks].sort((a, b) => b.people - a.people || a.start.localeCompare(b.start)).slice(0, 3);
  await Promise.all(biggest.map(async w => {
    const period = { start: w.start, end: w.end };
    const [ref, os] = await Promise.all([
      segment({ event: ACTIVE, start: w.start, end: w.end, groupBy: [{ type: 'user', value: 'gp:initial_referring_domain' }], limit: 200 }),
      segment({ event: ACTIVE, start: w.start, end: w.end, groupBy: [{ type: 'user', value: 'os' }], limit: 200 }),
    ]);
    for (const [fam, n] of sumBy(groupTotals(ref), referrerFamily)) {
      p.fact(`amp.referrer.week.${w.start}.${slug(fam)}`, `People whose first referrer was ${fam}, week starting ${w.start}`, period, n, 'amplitude');
    }
    for (const [b, n] of top(sumBy(groupTotals(os), browserFamily), 6)) {
      p.fact(`amp.browser.week.${w.start}.${slug(b)}`, `People using ${b}, week starting ${w.start}`, period, n, 'amplitude');
    }
  }));
}

async function amplitudeYearReferrers(p: Pack, histEnd: string) {
  const period = { start: YEAR_START, end: histEnd };
  const r = await segment({ event: ACTIVE, start: YEAR_START, end: histEnd, groupBy: [{ type: 'user', value: 'gp:initial_referring_domain' }], limit: 500 });
  if (r.hitGroupLimit) log('year referrers hit the group limit; small families are undercounted');
  const totals = groupTotals(r);
  for (const [fam, n] of sumBy(totals, referrerFamily)) {
    p.fact(`amp.referrer.year.${slug(fam)}`, `People whose first referrer was ${fam}, 2026 until the cookie banner`, period, n, 'amplitude');
  }
  for (const [name, n] of sumBy(new Map([...totals].filter(([d]) => aiAssistantName(d))), d => aiAssistantName(d)!)) {
    p.fact(`amp.ai.year.${slug(name)}`, `People whose first referrer was the AI assistant ${name}, 2026 until the cookie banner`, period, n, 'amplitude');
  }
  // Families with no people still exist as zero, so "none came from X" can be cited.
  for (const fam of REFERRER_FAMILIES) {
    if (!p.facts.has(`amp.referrer.year.${slug(fam)}`)) {
      p.fact(`amp.referrer.year.${slug(fam)}`, `People whose first referrer was ${fam}, 2026 until the cookie banner`, period, 0, 'amplitude');
    }
  }
}

async function amplitudeYearGroup(
  p: Pack, histEnd: string, prop: string, idPart: string, what: string, key: (l: string) => string, n: number,
) {
  const period = { start: YEAR_START, end: histEnd };
  const r = await segment({ event: ACTIVE, start: YEAR_START, end: histEnd, groupBy: [{ type: 'user', value: prop }], limit: 500 });
  for (const [name, v] of top(sumBy(groupTotals(r), key), n)) {
    p.fact(`amp.${idPart}.year.${slug(name)}`, `People ${what} ${name}, 2026 until the cookie banner`, period, v, 'amplitude');
  }
}

interface RetentionRow { count: number; outof: number; incomplete: boolean }
const RET_MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** "Oct 05, 2026" -> "2026-10-05" */
function retentionDay(label: string): string | null {
  const m = label.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  return m && RET_MONTHS[m[1]!] ? `${m[3]}-${RET_MONTHS[m[1]!]}-${m[2]!.padStart(2, '0')}` : null;
}

async function amplitudeD7(p: Pack) {
  // The last cohort whose 7 days are over and fully before the cookie banner.
  const lastCohort = addDays(CONSENT_START, -8);
  const res = await amplitudeGet<{ data?: { series?: Array<{ values?: Record<string, RetentionRow[]> }> } }>('/2/retention', {
    se: JSON.stringify({ event_type: '_new' }),
    re: JSON.stringify({ event_type: '_active' }),
    start: YEAR_START.replace(/-/g, ''),
    end: lastCohort.replace(/-/g, ''),
    rm: 'bracket',
    rb: '[[1,7]]',
    s: JSON.stringify([
      { prop: 'os', op: 'does not contain', values: ['spider', 'Spider', 'bot', 'Bot', 'Headless', 'indexer', 'crawler', 'Crawler'] },
      { prop: 'device_type', op: 'is not', values: ['Linux'] },
    ]),
  });
  const values = res.data?.series?.[0]?.values;
  if (!values) throw new Error('retention response had no series');
  const byMonth = new Map<string, { cohort: number; back: number }>();
  for (const [label, rows] of Object.entries(values)) {
    const day = retentionDay(label);
    const [d0, d7] = rows;
    if (!day || day > lastCohort || !d0 || !d7 || d7.incomplete || !(d0.outof > 0)) continue;
    const m = byMonth.get(day.slice(0, 7)) ?? { cohort: 0, back: 0 };
    m.cohort += d0.outof;
    m.back += d7.count;
    byMonth.set(day.slice(0, 7), m);
  }
  let cohort = 0, back = 0;
  for (const [ym, m] of [...byMonth].sort()) {
    const period = { start: monthStart(ym), end: monthEnd(ym) > lastCohort ? lastCohort : monthEnd(ym) };
    p.fact(`amp.d7.cohort.${ym}`, `New people first seen in ${monthLabel(ym)} (cohorts old enough to measure)`, period, m.cohort, 'amplitude');
    p.fact(`amp.d7.back.${ym}`, `Of those first seen in ${monthLabel(ym)}, how many came back within 7 days`, period, m.back, 'amplitude');
    cohort += m.cohort;
    back += m.back;
  }
  const all = { start: YEAR_START, end: lastCohort };
  p.fact('amp.d7.cohort.all', 'New people first seen from 1 Jan 2026 (cohorts old enough to measure)', all, cohort, 'amplitude');
  p.fact('amp.d7.back.all', 'Of all those new people, how many came back within 7 days', all, back, 'amplitude');
}

async function amplitudeDeadClicks(p: Pack, histEnd: string) {
  const period = { start: YEAR_START, end: histEnd };
  const event = '[Amplitude] Dead Click';
  const [grouped, all] = await Promise.all([
    segment({ event, start: YEAR_START, end: histEnd, metric: 'totals', groupBy: [{ type: 'event', value: '[Amplitude] Element Text' }], limit: 1000 }),
    segment({ event, start: YEAR_START, end: histEnd, metric: 'totals' }),
  ]);
  if (grouped.hitGroupLimit) log('dead clicks hit the group limit; topic totals may be undercounted');
  const byTopic = new Map<string, number>();
  for (const g of grouped.groups) {
    const topic = topicName(g.label);
    if (topic) byTopic.set(topic, (byTopic.get(topic) ?? 0) + g.total);
  }
  let onTiles = 0;
  for (const [topic, n] of byTopic) {
    onTiles += n;
    p.fact(`amp.deadclick.year.topic.${slug(topic)}`, `Dead clicks on the "${topic}" topic tile, 2026`, period, n, 'amplitude');
  }
  p.fact('amp.deadclick.year.topics-total', 'Dead clicks on all topic tiles together, 2026', period, onTiles, 'amplitude');
  p.fact('amp.deadclick.year.total', 'Dead clicks anywhere on the site, 2026', period, all.groups[0]?.total ?? 0, 'amplitude');
}

async function amplitudeRageClicks(p: Pack, histEnd: string) {
  const r = await segment({ event: '[Amplitude] Rage Click', start: YEAR_START, end: histEnd, metric: 'totals' });
  p.fact('amp.rageclick.year.total', 'Rage clicks anywhere on the site, 2026', { start: YEAR_START, end: histEnd }, r.groups[0]?.total ?? 0, 'amplitude');
}

async function amplitudePages(p: Pack, histEnd: string) {
  const period = { start: YEAR_START, end: histEnd };
  const r = await segment({ event: 'page_view', start: YEAR_START, end: histEnd, metric: 'totals', groupBy: [{ type: 'event', value: 'route_path' }], limit: 500 });
  for (const [path, n] of top(groupTotals(r), 8)) {
    p.fact(`amp.pageviews.year.route.${slug(path)}`, `Page views of ${path}, 2026`, period, n, 'amplitude');
  }
}

const VITAL_LABEL: Record<string, string> = {
  LCP: 'Largest Contentful Paint (ms)', INP: 'Interaction to Next Paint (ms)', CLS: 'Cumulative Layout Shift (score)',
  FCP: 'First Contentful Paint (ms)', TTFB: 'Time to First Byte (ms)',
};

async function amplitudeVitals(p: Pack, histEnd: string) {
  const months = monthsBetween(YEAR_START, histEnd).filter(ym => monthEnd(ym) <= histEnd);
  await Promise.all(months.map(async ym => {
    const period = { start: monthStart(ym), end: monthEnd(ym) };
    const v = await getWebVitals(period);
    for (const [metric, s] of Object.entries(v.metrics)) {
      if (!s || !(s.samples > 0) || s.p75 == null) continue;
      const tag = s.sampled ? ' (sampled)' : '';
      p.fact(`amp.vitals.${ym}.${metric.toLowerCase()}.p75`, `${VITAL_LABEL[metric] ?? metric} p75 in ${monthLabel(ym)}${tag}`, period, s.p75, 'amplitude');
      p.fact(`amp.vitals.${ym}.${metric.toLowerCase()}.samples`, `${metric} measurements in ${monthLabel(ym)}`, period, s.samples, 'amplitude');
    }
  }));
}

// ── Amplitude, since the consent change (consenting visitors only) ───────────

async function amplitudeConsent(p: Pack, today: string) {
  const yesterday = addDays(today, -1);
  if (yesterday < CONSENT_START) return;
  const weeks: Period[] = [];
  for (let s = CONSENT_START; addDays(s, 6) <= yesterday; s = addDays(s, 7)) weeks.push({ start: s, end: addDays(s, 6) });
  const [total, perWeek] = await Promise.all([
    segment({ event: ACTIVE, start: CONSENT_START, end: yesterday }),
    Promise.all(weeks.map(async w => [w, (await segment({ event: ACTIVE, start: w.start, end: w.end })).groups[0]?.total ?? 0] as const)),
  ]);
  p.fact('amp.consent.total', 'People who accepted cookies, since the cookie banner', { start: CONSENT_START, end: yesterday }, total.groups[0]?.total ?? 0, 'amplitude');
  for (const [w, n] of perWeek) {
    p.fact(`amp.consent.week.${w.start}`, `People who accepted cookies, 7 days from ${w.start}`, w, n, 'amplitude');
  }
  if (perWeek.length >= 2) {
    p.addSeries('amp.consent.weekly', 'People who accepted cookies, per 7 days since the cookie banner', { start: weeks[0]!.start, end: weeks[weeks.length - 1]!.end },
      perWeek.map(([w, n]) => ({ key: w.start, value: n })), 'amplitude');
  }
}

// ── Counter (cookieless, every visitor, one person counted once per day) ─────

async function counterBlock(p: Pack, today: string) {
  const startDay = await getCounterStartDay();
  if (!startDay) throw new Error('the counter has no data yet');
  const yesterday = addDays(today, -1);
  const noon = new Date(`${today}T12:00:00Z`);

  const all = await getVisitStats({ start: startDay, end: yesterday });
  const range = { start: startDay, end: yesterday };
  p.fact('counter.visitors.total', 'Visitor-days counted since the counter started (a person counts once per day)', range, all.visitors, 'counter');
  p.fact('counter.pageviews.total', 'Page views counted since the counter started', range, all.pageviews, 'counter');

  const byDay = new Map(all.daily.map(d => [d.day, d.visitors]));
  const weeks: Array<{ start: string; value: number }> = [];
  let monday = startDay;
  while (new Date(`${monday}T00:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
  for (; addDays(monday, 6) <= yesterday; monday = addDays(monday, 7)) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += byDay.get(addDays(monday, i)) ?? 0;
    weeks.push({ start: monday, value: sum });
    p.fact(`counter.visitors.week.${monday}`, `Visitor-days counted in the week starting ${monday}`, { start: monday, end: addDays(monday, 6) }, sum, 'counter');
  }
  if (weeks.length >= 2) {
    p.addSeries('counter.visitors.weekly', 'Visitor-days per week (a person counts once per day)',
      { start: weeks[0]!.start, end: addDays(weeks[weeks.length - 1]!.start, 6) }, weeks.map(w => ({ key: w.start, value: w.value })), 'counter');
  }

  const cur = (await getVisitStats(lastDays(28, noon).current));
  const period = cur.range;
  p.fact('counter.visitors.28d', 'Visitor-days in the last 28 days', period, cur.visitors, 'counter');
  p.fact('counter.pageviews.28d', 'Page views in the last 28 days', period, cur.pageviews, 'counter');
  for (const c of cur.channels.slice(0, 6)) p.fact(`counter.channel.28d.${slug(c.name)}`, `Visitor-days arriving by ${c.name}, last 28 days`, period, c.visitors, 'counter');
  for (const c of cur.pages.slice(0, 8)) p.fact(`counter.page.28d.${slug(c.name)}`, `Page views of ${c.name}, last 28 days`, period, c.pageviews, 'counter');
  for (const c of cur.countries.slice(0, 8)) p.fact(`counter.country.28d.${slug(c.name)}`, `Visitor-days from ${c.name}, last 28 days`, period, c.visitors, 'counter');
  for (const c of cur.devices.slice(0, 4)) p.fact(`counter.device.28d.${slug(c.name)}`, `Visitor-days on ${c.name}, last 28 days`, period, c.visitors, 'counter');
}

// ── Search Console ───────────────────────────────────────────────────────────

async function searchBlock(p: Pack, today: string) {
  const { current, previous } = lastDays(28, new Date(`${today}T12:00:00Z`));
  const cur = await getSearchData(current.start, current.end);
  if (!cur) { log('search: GSC credentials not set, skipped'); return; }
  const prev = await getSearchData(previous.start, previous.end);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const [tag, d, period] of [['28d', cur, current], ['prev28d', prev, previous]] as const) {
    if (!d) continue;
    const when = tag === '28d' ? 'last 28 days' : 'the 28 days before that';
    p.fact(`gsc.impressions.${tag}`, `Google search impressions, ${when}`, period, d.totals.impressions, 'search');
    p.fact(`gsc.clicks.${tag}`, `Google search clicks, ${when}`, period, d.totals.clicks, 'search');
    p.fact(`gsc.position.${tag}`, `Average Google search position, ${when}`, period, r2(d.totals.position), 'search');
  }
  for (const q of cur.queries.slice(0, 5)) {
    p.fact(`gsc.query.28d.${slug(q.name)}.impressions`, `Impressions for the search "${q.name}", last 28 days`, current, q.impressions, 'search');
    p.fact(`gsc.query.28d.${slug(q.name)}.clicks`, `Clicks for the search "${q.name}", last 28 days`, current, q.clicks, 'search');
  }
  for (const pg of cur.pages.slice(0, 5)) {
    p.fact(`gsc.page.28d.${slug(pg.name)}.impressions`, `Search impressions for the page ${pg.name}, last 28 days`, current, pg.impressions, 'search');
    p.fact(`gsc.page.28d.${slug(pg.name)}.clicks`, `Search clicks to the page ${pg.name}, last 28 days`, current, pg.clicks, 'search');
  }
}

// ── Subscribers ──────────────────────────────────────────────────────────────

async function subscribersBlock(p: Pack, today: string) {
  const db = getDb();
  // Same filter as subscriberCounts() in app/analytics/page.tsx.
  const counted = sql`(plan_type = 'free' or (plan_type in ('supporter_monthly', 'patron_monthly') and payment_status = 'active'))`;
  const [plans, months] = await Promise.all([
    db.execute(sql`select plan_type as plan, count(*) as n from subscribers where ${counted} group by plan_type`),
    db.execute(sql`select to_char(created_at at time zone 'UTC', 'YYYY-MM') as m, count(*) as n from subscribers where ${counted} group by 1 order by 1`),
  ]);
  const now = { start: today, end: today };
  let total = 0;
  for (const r of plans.rows as Array<{ plan: string; n: unknown }>) {
    total += Number(r.n);
    p.fact(`subs.count.${slug(r.plan)}`, `Subscribers on the ${r.plan} plan, today`, now, Number(r.n), 'subscribers');
  }
  p.fact('subs.count.total', 'All counted subscribers, today', now, total, 'subscribers');
  const rows = (months.rows as Array<{ m: string; n: unknown }>).filter(r => r.m);
  for (const r of rows) {
    const end = monthEnd(r.m) > today ? today : monthEnd(r.m);
    p.fact(`subs.signups.month.${r.m}`, `Subscribers who signed up in ${monthLabel(r.m)} (still counted today)`, { start: monthStart(r.m), end }, Number(r.n), 'subscribers');
  }
  if (rows.length >= 2) {
    p.addSeries('subs.signups.monthly', 'Subscribers by sign-up month (still counted today); keys are month starts',
      { start: monthStart(rows[0]!.m), end: today }, rows.map(r => ({ key: monthStart(r.m), value: Number(r.n) })), 'subscribers');
  }
}

// ── Build ────────────────────────────────────────────────────────────────────

export async function buildDataPack(today: string): Promise<DataPack> {
  const p = new Pack();
  const histEnd = addDays(CONSENT_START, -1);

  const weeksP = p.block('amplitude.weekly', () => amplitudeWeekly(p, histEnd));
  await Promise.all([
    weeksP,
    p.block('amplitude.topWeeks', async () => {
      const weeks = await weeksP;
      if (weeks?.length) await amplitudeTopWeeks(p, weeks);
      else throw new Error('no weekly series to pick the biggest weeks from');
    }),
    p.block('amplitude.monthly', () => amplitudeMonthly(p, histEnd)),
    p.block('amplitude.referrers', () => amplitudeYearReferrers(p, histEnd)),
    p.block('amplitude.languages', () => amplitudeYearGroup(p, histEnd, 'language', 'language', 'using', languageName, 10)),
    p.block('amplitude.countries', () => amplitudeYearGroup(p, histEnd, 'country', 'country', 'from', l => l.trim() || 'Unknown', 10)),
    p.block('amplitude.devices', () => amplitudeYearGroup(p, histEnd, 'device_type', 'device', 'on', l => l.trim() || 'Unknown', 8)),
    p.block('amplitude.browsers', () => amplitudeYearGroup(p, histEnd, 'os', 'browser', 'using', browserFamily, 8)),
    p.block('amplitude.d7', () => amplitudeD7(p)),
    p.block('amplitude.deadClicks', () => amplitudeDeadClicks(p, histEnd)),
    p.block('amplitude.rageClicks', () => amplitudeRageClicks(p, histEnd)),
    p.block('amplitude.pages', () => amplitudePages(p, histEnd)),
    p.block('amplitude.vitals', () => amplitudeVitals(p, histEnd)),
    p.block('amplitude.consent', () => amplitudeConsent(p, today)),
    p.block('counter', () => counterBlock(p, today)),
    p.block('search', () => searchBlock(p, today)),
    p.block('subscribers', () => subscribersBlock(p, today)),
  ]);

  // Blocks finish in any order; sort so the pack (and the prompt built from it) is stable.
  const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);
  return {
    today,
    facts: [...p.facts.values()].sort(byId),
    series: [...p.series.values()].sort(byId),
    failedBlocks: p.failed.sort(),
  };
}

