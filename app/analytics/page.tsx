import type { Metadata } from 'next';
import Link from 'next/link';
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

/**
 * Private analytics for the owner: visitors (cookieless counter, plus history
 * imported from Amplitude up to HISTORY_END), Google search (live from Search
 * Console) and subscribers. `?days=` picks the period for both charts.
 * Password-gated (lib/analytics/adminAuth.ts), noindex, disallowed in robots,
 * not in the sitemap or any menu.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Analytics',
  robots: { index: false, follow: false, nocache: true },
};

const RANGES = [7, 14, 28, 90] as const;
const ACCENT = '#8B6914';
const SECOND = '#2563EB';

// Search Console data only changes a few times a day.
const searchData = unstable_cache(
  async (start: string, end: string) => getSearchData(start, end),
  ['analytics-search-console'],
  { revalidate: 3 * 3600 },
);

async function subscriberCounts(): Promise<Array<{ plan: string; n: number }>> {
  const rows = await getDb().execute(sql`
    select plan_type as plan, count(*) as n from subscribers
    where plan_type = 'free'
       or (plan_type in ('supporter_monthly', 'patron_monthly') and payment_status = 'active')
    group by plan_type order by 2 desc`);
  return (rows.rows as Array<{ plan: string; n: unknown }>).map(r => ({ plan: r.plan, n: Number(r.n) }));
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

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
          clicks: byDay.get(day)?.clicks ?? 0,
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <Table title={`Where they came from · ${days} days`} rows={cur.value.channels.map(r => [r.name, r.visitors])} />
              <Table title={`Referring sites · ${days} days`} rows={cur.value.referrers.map(r => [r.name, r.visitors])} />
              <Table
                title={`Top pages (views) · ${days} days`}
                note={pageviewsPartial && counterStart ? `since ${fmtDate(counterStart)}` : undefined}
                rows={cur.value.pages.map(r => [r.name, r.pageviews])}
              />
              <Table title={`Countries · ${days} days`} rows={cur.value.countries.map(r => [r.name, r.visitors])} />
              <Table title={`Devices · ${days} days`} rows={cur.value.devices.map(r => [r.name, r.visitors])} />
            </div>
          </>
        ) : (
          <ErrorNote error={[cur, prev].find(r => !r.ok) as { error: string }} />
        )}
      </Section>

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
                { key: 'clicks', label: 'Clicks', color: SECOND },
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

// ── Pieces ───────────────────────────────────────────────────────────────────

function Shell({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16 min-h-screen">
      <div className="flex items-end justify-between gap-4 mb-2">
        <div>
          <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-[var(--color-accent)] mb-2">Private</p>
          <h1 className="text-page-h1 font-semibold text-[var(--color-text-primary)]">Analytics</h1>
        </div>
        {aside}
      </div>
      {children}
    </main>
  );
}

/** The period switch, placed right above each chart it controls. Keeps the scroll position. */
function RangePicker({ days }: { days: number }) {
  return (
    <nav className="flex gap-1 mb-4" aria-label="Period">
      {RANGES.map(r => (
        <Link
          key={r}
          href={`/analytics?days=${r}`}
          scroll={false}
          aria-current={r === days ? 'true' : undefined}
          className={`px-3 py-1.5 rounded-[2px] text-[13px] border transition-colors ${
            r === days
              ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
              : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]'
          }`}
        >
          {r} days
        </Link>
      ))}
    </nav>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 md:p-7">
      <h2 className="text-section font-semibold text-[var(--color-text-primary)] mb-1">{title}</h2>
      <p className="text-meta text-[var(--color-text-secondary)] mb-5">{note}</p>
      {children}
    </section>
  );
}

function Stat({ label, value, prev, suffix }: { label: string; value: number; prev?: number; suffix?: string }) {
  const diff = prev === undefined ? null : value - prev;
  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4">
      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)] mb-2">{label}</p>
      <p className="text-2xl font-semibold text-[var(--color-text-primary)] tabular-nums">
        {value.toLocaleString('en-GB')}
        {suffix && <span className="text-base font-normal text-[var(--color-text-secondary)]">{suffix}</span>}
      </p>
      {diff !== null && (
        <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">
          {diff === 0 ? 'same as' : `${diff > 0 ? '+' : ''}${diff.toLocaleString('en-GB')} vs`} previous
        </p>
      )}
    </div>
  );
}

function Table({ title, note, rows }: { title: string; note?: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <p className="text-meta font-semibold text-[var(--color-text-primary)] mb-2">
        {title}
        {note && <span className="font-normal text-[var(--color-text-secondary)]"> · {note}</span>}
      </p>
      {rows.length === 0 ? (
        <p className="text-meta text-[var(--color-text-secondary)]">No visits in this period yet.</p>
      ) : (
        <ul className="text-[13px] divide-y divide-[var(--color-border)]">
          {rows.map(([name, n]) => (
            <li key={name} className="flex justify-between gap-4 py-1.5">
              <span className="truncate text-[var(--color-text-secondary)]" title={name}>{name}</span>
              <span className="tabular-nums text-[var(--color-text-primary)]">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ErrorNote({ error }: { error: { error: string } }) {
  return <p className="text-meta text-red-600">Couldn&apos;t load: {error.error}</p>;
}
