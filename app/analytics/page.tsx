import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { analyticsPassword, isValidSession, SESSION_COOKIE } from '@/lib/analytics/adminAuth';
import { getVisitStats, getCounterStartDay, daysEndingToday, lastDays, eachDay, HISTORY_END } from '@/lib/analytics/visits';
import { getSearchData } from '@/lib/analytics/searchConsole';
import LoginForm from './LoginForm';
import TrendChart from './TrendChart';
import { logout } from './actions';
import {
  amplitudeConfigured, getConsentedVisits, getCoverage, getTaggedLandings, getWebVitals,
} from '@/lib/analytics/amplitude';
import { listActiveInsights } from '@/lib/analytics/insights/store';
import {
  ACCENT, BarList, ErrorNote, RANGES, RangePicker, SECOND, Section, Shell, Stat, Table, fmtDate, settle,
} from './ui';
import { InsightsSection } from './sections/Insights';
import { AmplitudeHeader } from './sections/AmplitudeHeader';
import { ReturningSection } from './sections/Returning';
import { EngagementSection } from './sections/Engagement';
import { ReplaysSection } from './sections/Replays';
import { SocialSection } from './sections/Social';
import { VitalsSection } from './sections/Vitals';

/**
 * Private analytics for the owner: historical insight tiles, visitors
 * (cookieless counter, plus history imported from Amplitude up to
 * HISTORY_END), the Amplitude group for visitors who accepted cookies
 * (returning readers, engagement, session replays, social posts, web vitals),
 * Google search (live from Search Console) and subscribers. `?days=` picks the
 * period for the charts and the Amplitude group. Spec:
 * docs/superpowers/specs/2026-10-16-analytics-amplitude-design.md.
 * Password-gated (lib/analytics/adminAuth.ts), noindex, disallowed in robots,
 * not in the sitemap or any menu.
 */

export const dynamic = 'force-dynamic';
// A full Amplitude refresh is ~22 calls (rate-limited to 3 at a time).
export const maxDuration = 60;

export const metadata: Metadata = {
  title: 'Analytics',
  robots: { index: false, follow: false, nocache: true },
};

// Search Console data only changes a few times a day.
const searchData = unstable_cache(
  async (start: string, end: string) => getSearchData(start, end),
  ['analytics-search-console'],
  { revalidate: 3 * 3600 },
);

// Amplitude reads: the loaders clamp to consent and the 30 days replays are
// kept; the cache is keyed by the range they are given.
const amplitudeCache = { revalidate: 3 * 3600 };
const consentedVisits = unstable_cache(
  async (start: string, end: string) => getConsentedVisits({ start, end }),
  ['analytics-amplitude-visits'],
  amplitudeCache,
);
const coverageData = unstable_cache(
  async (start: string, end: string) => getCoverage({ start, end }),
  ['analytics-amplitude-coverage'],
  amplitudeCache,
);
const taggedLandings = unstable_cache(
  async (start: string, end: string) => getTaggedLandings({ start, end }),
  ['analytics-amplitude-tagged'],
  amplitudeCache,
);
const webVitals = unstable_cache(
  async (start: string, end: string) => getWebVitals({ start, end }),
  ['analytics-amplitude-vitals'],
  amplitudeCache,
);

async function subscriberCounts(): Promise<Array<{ plan: string; n: number }>> {
  const rows = await getDb().execute(sql`
    select plan_type as plan, count(*) as n from subscribers
    where plan_type = 'free'
       or (plan_type in ('supporter_monthly', 'patron_monthly') and payment_status = 'active')
    group by plan_type order by 2 desc`);
  return (rows.rows as Array<{ plan: string; n: unknown }>).map(r => ({ plan: r.plan, n: Number(r.n) }));
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const password = analyticsPassword();
  const session = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!password) {
    return (
      <Shell>
        <p className="text-body text-[var(--color-text-secondary)] text-center mt-10">
          Not set up yet: add <code>ANALYTICS_PASSWORD</code> in Vercel and redeploy.
        </p>
      </Shell>
    );
  }
  if (!isValidSession(session)) {
    return <Shell><LoginForm /></Shell>;
  }

  const params = await searchParams;
  const days = RANGES.find(r => String(r) === params.days) ?? 28;
  const visitRange = daysEndingToday(days);
  // Google's numbers lag, so its period ends yesterday.
  const searchRange = lastDays(days);

  const [startDay, cur, prev, search, searchPrev, subs] = await Promise.all([
    settle(getCounterStartDay()),
    settle(getVisitStats(visitRange.current)),
    settle(getVisitStats(visitRange.previous)),
    settle(searchData(searchRange.current.start, searchRange.current.end)),
    settle(searchData(searchRange.previous.start, searchRange.previous.end)),
    settle(subscriberCounts()),
  ]);

  const counterStart = startDay.ok ? startDay.value : null;

  // Amplitude group: same range as Visitors. Nothing is requested without a secret key.
  const ampOn = amplitudeConfigured();
  const ampRange = visitRange.current;
  const [insights, visits, coverage, tagged, vitals] = await Promise.all([
    settle(listActiveInsights()),
    ampOn ? settle(consentedVisits(ampRange.start, ampRange.end)) : null,
    ampOn
      ? settle(coverageData(ampRange.start, ampRange.end).then(async c =>
          c ? { ...c, visitorDays: (await getVisitStats(c.window)).visitors } : null))
      : null,
    ampOn ? settle(taggedLandings(ampRange.start, ampRange.end)) : null,
    ampOn ? settle(webVitals(ampRange.start, ampRange.end)) : null,
  ]);

  const visitChart = cur.ok
    ? (() => {
        const byDay = new Map(cur.value.daily.map(d => [d.day, d]));
        return eachDay(visitRange.current).map(day => {
          const d = byDay.get(day);
          // Page views exist for 3 Mar–15 Apr (Amplitude auto-capture) and from
          // the counter's start; nothing recorded them in between.
          const pvKnown = d?.pageviews != null || (!!counterStart && day >= counterStart);
          return { day, visitors: d?.visitors ?? 0, pageviews: pvKnown ? d?.pageviews ?? 0 : null };
        });
      })()
    : [];
  const pageviewsPartial = visitChart.some(d => d.pageviews === null);

  const searchChart = search.ok && search.value
    ? (() => {
        const byDay = new Map(search.value.daily.map(d => [d.day, d]));
        return eachDay(searchRange.current).map(day => ({
          day,
          impressions: byDay.get(day)?.impressions ?? 0,
        }));
      })()
    : [];

  const prevSearch = searchPrev.ok ? searchPrev.value?.totals : undefined;
  const picker = <RangePicker days={days} />;

  return (
    <Shell
      aside={
        <form action={logout}>
          <button type="submit" className="text-meta text-[var(--color-text-secondary)] underline underline-offset-2 hover:text-[var(--color-accent)]">
            Sign out
          </button>
        </form>
      }
    >
      {/* ── Historical insights ──────────────────────────────── */}
      <InsightsSection insights={insights} />

      {/* ── Visitors ─────────────────────────────────────────── */}
      <Section
        title="Visitors"
        note={`${fmtDate(visitRange.current.start)} – today, compared with the ${days} days before. Every visitor counted, bots removed; a person counts once per day they visit. Up to ${fmtDate(HISTORY_END)} from Amplitude, since then from the site's own cookieless counter.`}
      >
        {cur.ok && prev.ok ? (
          <>
            {picker}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label={`Visitors · ${days} days`} value={cur.value.visitors} prev={prev.value.visitors} />
              <Stat label={`Page views · ${days} days`} value={cur.value.pageviews} prev={pageviewsPartial ? undefined : prev.value.pageviews} />
              <Stat label="Avg visitors / day" value={Math.round((cur.value.visitors / days) * 10) / 10} />
              <Stat label={`Bots filtered · ${days} days`} value={cur.value.botsExcluded} />
            </div>
            <TrendChart
              data={visitChart}
              series={[
                { key: 'visitors', label: 'Visitors', color: ACCENT },
                { key: 'pageviews', label: 'Page views', color: SECOND },
              ]}
            />
            {pageviewsPartial && counterStart && (
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-2">
                No page-view data for the blank days: Amplitude stopped recording page views for every visitor on 15 Apr, and the counter took over on {fmtDate(counterStart)}.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 mt-8">
              <BarList title={`Where they came from · ${days} days`} unit="visitors" rows={cur.value.channels.map(r => [r.name, r.visitors])} />
              <BarList title={`Referring sites · ${days} days`} unit="visitors" rows={cur.value.referrers.map(r => [r.name, r.visitors])} />
              <BarList
                title={`Top pages · ${days} days`}
                note={pageviewsPartial && counterStart ? `since ${fmtDate(counterStart)}` : undefined}
                unit="views"
                rows={cur.value.pages.map(r => [r.name, r.pageviews])}
              />
              <BarList title={`Countries · ${days} days`} unit="visitors" rows={cur.value.countries.map(r => [r.name, r.visitors])} />
              <Table title={`Devices · ${days} days`} rows={cur.value.devices.map(r => [r.name, r.visitors])} />
            </div>
          </>
        ) : (
          <ErrorNote error={[cur, prev].find(r => !r.ok) as { error: string }} />
        )}
      </Section>

      {/* ── Amplitude: visitors who accepted cookies ───────────── */}
      <AmplitudeHeader days={days} configured={ampOn} coverage={coverage ?? { ok: true, value: null }} />
      {ampOn && visits && tagged && vitals && (
        <>
          <ReturningSection visits={visits} />
          <EngagementSection visits={visits} />
          <ReplaysSection visits={visits} />
          <SocialSection tagged={tagged} />
          <VitalsSection vitals={vitals} />
        </>
      )}

      {/* ── Google ───────────────────────────────────────────── */}
      <Section
        title="Google search"
        note={`${fmtDate(searchRange.current.start)} – ${fmtDate(searchRange.current.end)}, live from Search Console, compared with the ${days} days before. Google revises the last two days, so a dip at the end is often not real.`}
      >
        {!search.ok ? (
          <ErrorNote error={search} />
        ) : !search.value ? (
          <p className="text-meta text-[var(--color-text-secondary)]">
            Add <code>GSC_CLIENT_EMAIL</code>, <code>GSC_PRIVATE_KEY_B64</code> and <code>GSC_SITE_URL</code> in Vercel to show this.
          </p>
        ) : (
          <>
            {picker}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label={`Impressions · ${days} days`} value={search.value.totals.impressions} prev={prevSearch?.impressions} />
              <Stat label={`Clicks · ${days} days`} value={search.value.totals.clicks} prev={prevSearch?.clicks} />
              <Stat label="Avg position (1 = top)" value={Math.round(search.value.totals.position * 10) / 10} />
              <Stat
                label="Click rate"
                value={search.value.totals.impressions
                  ? Math.round((search.value.totals.clicks / search.value.totals.impressions) * 1000) / 10
                  : 0}
                suffix="%"
              />
            </div>
            <TrendChart
              data={searchChart}
              series={[
                { key: 'impressions', label: 'Impressions', color: ACCENT },
              ]}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <Table title={`Top queries (impressions) · ${days} days`} rows={search.value.queries.map(q => [q.name, q.impressions])} />
              <Table title={`Top pages (impressions) · ${days} days`} rows={search.value.pages.map(p => [p.name, p.impressions])} />
            </div>
          </>
        )}
      </Section>

      {/* ── Subscribers ──────────────────────────────────────── */}
      <Section title="Subscribers" note="Active right now: free sign-ups plus paying supporters.">
        {subs.ok ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total" value={subs.value.reduce((s, r) => s + r.n, 0)} />
            {subs.value.map(r => <Stat key={r.plan} label={r.plan.replace(/_/g, ' ')} value={r.n} />)}
          </div>
        ) : (
          <ErrorNote error={subs} />
        )}
      </Section>
    </Shell>
  );
}
