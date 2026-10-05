import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { analyticsPassword, isValidSession, SESSION_COOKIE } from '@/lib/analytics/adminAuth';
import { getVisitStats, getCounterStartDay, daysEndingToday, lastDays, eachDay } from '@/lib/analytics/visits';
import { getSearchData } from '@/lib/analytics/searchConsole';
import { getEventTotals } from '@/seo/analytics/visitors';
import LoginForm from './LoginForm';
import TrendChart from './TrendChart';
import { logout } from './actions';

/**
 * Private analytics for the owner: visitors (cookieless counter), Google
 * search (live from Search Console), reader behaviour (Amplitude, consenting
 * readers only) and subscribers. `?days=` picks the period for everything.
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

const AMPLITUDE_EVENTS = [
  'page_view', 'digest_view', 'article_click', 'share_clicked',
  'subscribe_view', 'checkout_start', 'checkout_complete',
] as const;

const EVENT_LABELS: Record<string, string> = {
  page_view: 'Page views',
  digest_view: 'Digest views',
  article_click: 'Article clicks',
  share_clicked: 'Shares',
  subscribe_view: 'Subscribe page views',
  checkout_start: 'Checkouts started',
  checkout_complete: 'Checkouts completed',
};

// Amplitude's API is slow and rate-limited; an hour-old number is fine here.
const amplitudeTotals = unstable_cache(
  async (start: string, end: string) =>
    getEventTotals(AMPLITUDE_EVENTS, { start: new Date(`${start}T00:00:00Z`), end: new Date(`${end}T00:00:00Z`) }),
  ['analytics-amplitude-totals'],
  { revalidate: 3600 },
);

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

  const [startDay, cur, prev, search, searchPrev, amp, subs] = await Promise.all([
    settle(getCounterStartDay()),
    settle(getVisitStats(visitRange.current)),
    settle(getVisitStats(visitRange.previous)),
    settle(searchData(searchRange.current.start, searchRange.current.end)),
    settle(searchData(searchRange.previous.start, searchRange.previous.end)),
    settle(amplitudeTotals(visitRange.current.start, visitRange.current.end)),
    settle(subscriberCounts()),
  ]);

  const counterStart = startDay.ok ? startDay.value : null;
  // No comparison until the counter covered the whole previous period.
  const comparable = !!counterStart && counterStart <= visitRange.previous.start;

  const visitChart = cur.ok
    ? (() => {
        const byDay = new Map(cur.value.daily.map(d => [d.day, d]));
        // Days before counting began are blank, not zero.
        const counted = (day: string) => !!counterStart && day >= counterStart;
        return eachDay(visitRange.current).map(day => ({
          day,
          visitors: counted(day) ? byDay.get(day)?.visitors ?? 0 : null,
          pageviews: counted(day) ? byDay.get(day)?.pageviews ?? 0 : null,
        }));
      })()
    : [];

  const searchChart = search.ok && search.value
    ? (() => {
        const byDay = new Map(search.value.daily.map(d => [d.day, d]));
        return eachDay(searchRange.current).map(day => {
          const d = byDay.get(day);
          return {
            day,
            impressions: d?.impressions ?? 0,
            clicks: d?.clicks ?? 0,
          };
        });
      })()
    : [];

  const prevSearch = searchPrev.ok ? searchPrev.value?.totals : undefined;

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <nav className="flex gap-1" aria-label="Period">
          {RANGES.map(r => (
            <Link
              key={r}
              href={`/analytics?days=${r}`}
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
        <form action={logout}>
          <button type="submit" className="text-meta text-[var(--color-text-secondary)] underline underline-offset-2 hover:text-[var(--color-accent)]">
            Sign out
          </button>
        </form>
      </div>

      {/* ── Visitors ─────────────────────────────────────────── */}
      <Section
        title="Visitors"
        note={`Last ${days} days including today so far, compared with the ${days} before. Cookieless counter: every visitor, bots removed; a person counts once per day they visit.${
          startDay.ok && startDay.value ? ` Counting since ${startDay.value}.` : ' No visits counted yet.'
        }`}
      >
        {cur.ok && prev.ok ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label="Visitors" value={cur.value.visitors} prev={comparable ? prev.value.visitors : undefined} />
              <Stat label="Page views" value={cur.value.pageviews} prev={comparable ? prev.value.pageviews : undefined} />
              <Stat label="Avg visitors / day" value={Math.round((cur.value.visitors / days) * 10) / 10} />
              <Stat label="Bots filtered" value={cur.value.botsExcluded} />
            </div>
            <TrendChart
              data={visitChart}
              series={[
                { key: 'visitors', label: 'Visitors', color: ACCENT },
                { key: 'pageviews', label: 'Page views', color: SECOND },
              ]}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <Table title="Where they came from" rows={cur.value.channels.map(r => [r.name, r.visitors])} />
              <Table title="Referring sites" rows={cur.value.referrers.map(r => [r.name, r.visitors])} />
              <Table title="Top pages (views)" rows={cur.value.pages.map(r => [r.name, r.pageviews])} />
              <Table title="Countries" rows={cur.value.countries.map(r => [r.name, r.visitors])} />
              <Table title="Devices" rows={cur.value.devices.map(r => [r.name, r.visitors])} />
            </div>
          </>
        ) : (
          <ErrorNote error={[cur, prev].find(r => !r.ok) as { error: string }} />
        )}
      </Section>

      {/* ── Google ───────────────────────────────────────────── */}
      <Section
        title="Google search"
        note={`Live from Search Console, ${searchRange.current.start} → ${searchRange.current.end}, compared with the ${days} days before. Google revises the last two days, so a dip at the end is often not real.`}
      >
        {!search.ok ? (
          <ErrorNote error={search} />
        ) : !search.value ? (
          <p className="text-meta text-[var(--color-text-secondary)]">
            Add <code>GSC_CLIENT_EMAIL</code>, <code>GSC_PRIVATE_KEY_B64</code> and <code>GSC_SITE_URL</code> in Vercel to show this.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label="Impressions" value={search.value.totals.impressions} prev={prevSearch?.impressions} />
              <Stat label="Clicks" value={search.value.totals.clicks} prev={prevSearch?.clicks} />
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
              <Table title="Top queries (impressions)" rows={search.value.queries.map(q => [q.name, q.impressions])} />
              <Table title="Top pages (impressions)" rows={search.value.pages.map(p => [p.name, p.impressions])} />
            </div>
          </>
        )}
      </Section>

      {/* ── Reader behaviour ─────────────────────────────────── */}
      <Section
        title="Reader behaviour"
        note={`Last ${days} days, from Amplitude. Until 5 Oct 2026 Amplitude tracked every visitor (bots partly filtered); since then only readers who accept cookies, so expect these to drop — use Visitors above for counts. Session recordings are in Amplitude itself.`}
      >
        {!amp.ok ? (
          <ErrorNote error={amp} />
        ) : !amp.value ? (
          <p className="text-meta text-[var(--color-text-secondary)]">
            Add <code>AMPLITUDE_SECRET_KEY</code> in Vercel to show this.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Amplitude users" value={amp.value.people} />
            {amp.value.events.map(e => (
              <Stat key={e.event} label={EVENT_LABELS[e.event] ?? e.event} value={e.total} />
            ))}
          </div>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16 min-h-screen">
      <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-[var(--color-accent)] mb-2">Private</p>
      <h1 className="text-page-h1 font-semibold text-[var(--color-text-primary)] mb-6">Analytics</h1>
      {children}
    </main>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 md:p-7">
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

function Table({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <p className="text-meta font-semibold text-[var(--color-text-primary)] mb-2">{title}</p>
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
