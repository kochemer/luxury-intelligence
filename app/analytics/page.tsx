import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { analyticsPassword, isValidSession, SESSION_COOKIE } from '@/lib/analytics/adminAuth';
import { getVisitStats, getCounterStartDay, lastDays, type VisitStats } from '@/lib/analytics/visits';
import { getEventTotals } from '@/seo/analytics/visitors';
import weekly from '@/data/seo/weekly-latest.json';
import type { SeoReport } from '@/seo/types';
import LoginForm from './LoginForm';
import { logout } from './actions';

/**
 * Private analytics for the owner: visitors (cookieless counter), reader
 * behaviour (Amplitude, consenting readers only), Google search (latest weekly
 * SEO snapshot) and subscribers. Password-gated (lib/analytics/adminAuth.ts),
 * noindex, disallowed in robots, not in the sitemap or any menu.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Analytics',
  robots: { index: false, follow: false, nocache: true },
};

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

export default async function AnalyticsPage() {
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

  const w7 = lastDays(7);
  const w28 = lastDays(28);

  const [startDay, s7, p7, s28, amp, subs] = await Promise.all([
    settle(getCounterStartDay()),
    settle(getVisitStats(w7.current)),
    settle(getVisitStats(w7.previous)),
    settle(getVisitStats(w28.current)),
    settle(amplitudeTotals(w28.current.start, w28.current.end)),
    settle(subscriberCounts()),
  ]);

  const report = weekly as unknown as SeoReport;
  const traffic = report.inputs.traffic;
  const indexing = report.inputs.indexing;

  return (
    <Shell>
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="text-meta text-[var(--color-text-secondary)]">
          Complete days only (UTC), up to {w7.current.end}.
        </p>
        <form action={logout}>
          <button type="submit" className="text-meta text-[var(--color-text-secondary)] underline underline-offset-2 hover:text-[var(--color-accent)]">
            Sign out
          </button>
        </form>
      </div>

      {/* ── Visitors ─────────────────────────────────────────── */}
      <Section
        title="Visitors"
        note={`Cookieless counter: every visitor, bots removed. A person counts once per day they visit.${
          startDay.ok && startDay.value ? ` Counting since ${startDay.value}.` : ' No visits counted yet.'
        }`}
      >
        {s7.ok && p7.ok && s28.ok ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label="Visitors · 7 days" value={s7.value.visitors} prev={p7.value.visitors} />
              <Stat label="Page views · 7 days" value={s7.value.pageviews} prev={p7.value.pageviews} />
              <Stat label="Visitors · 28 days" value={s28.value.visitors} />
              <Stat label="Bots filtered · 28 days" value={s28.value.botsExcluded} />
            </div>
            <DailyBars stats={s28.value} range={w28.current} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <Table title="Where they came from (28 days)" rows={s28.value.channels.map(r => [r.name, r.visitors])} />
              <Table title="Referring sites" rows={s28.value.referrers.map(r => [r.name, r.visitors])} />
              <Table title="Top pages (views)" rows={s28.value.pages.map(r => [r.name, r.pageviews])} />
              <Table title="Countries" rows={s28.value.countries.map(r => [r.name, r.visitors])} />
              <Table title="Devices" rows={s28.value.devices.map(r => [r.name, r.visitors])} />
            </div>
          </>
        ) : (
          <ErrorNote error={[s7, p7, s28].find(r => !r.ok) as { error: string }} />
        )}
      </Section>

      {/* ── Reader behaviour ─────────────────────────────────── */}
      <Section
        title="Reader behaviour · 28 days"
        note="From Amplitude, so only readers who accepted cookies — treat as a sample, not totals. Session recordings are in Amplitude itself."
      >
        {!amp.ok ? (
          <ErrorNote error={amp} />
        ) : !amp.value ? (
          <p className="text-meta text-[var(--color-text-secondary)]">
            Add <code>AMPLITUDE_SECRET_KEY</code> in Vercel to show this.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Consenting readers" value={amp.value.people} />
            {amp.value.events.map(e => (
              <Stat key={e.event} label={EVENT_LABELS[e.event] ?? e.event} value={e.total} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Google ───────────────────────────────────────────── */}
      <Section
        title="Google search"
        note={`From Search Console via the weekly SEO run (${report.week}, ${report.generatedAtISO.slice(0, 10)}).${
          traffic ? ` Window ${traffic.window.start} → ${traffic.window.end}.` : ''
        }`}
      >
        {traffic ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label="Impressions · 28 days" value={traffic.current.impressions} prev={traffic.previous?.impressions} />
              <Stat label="Clicks · 28 days" value={traffic.current.clicks} prev={traffic.previous?.clicks} />
              <Stat label="Avg position" value={Math.round(traffic.current.position * 10) / 10} />
              {indexing && <Stat label="Pages indexed" value={indexing.indexed} suffix={` / ${indexing.inspected}`} />}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Table title="Top queries (impressions)" rows={traffic.topQueries.map(q => [q.query, q.impressions])} />
              <Table title="Top pages (impressions)" rows={traffic.topPages.map(p => [p.path, p.impressions])} />
            </div>
          </>
        ) : (
          <p className="text-meta text-[var(--color-text-secondary)]">No Search Console data in the latest weekly report.</p>
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

function DailyBars({ stats, range }: { stats: VisitStats; range: { start: string; end: string } }) {
  const byDay = new Map(stats.daily.map(d => [d.day, d.visitors]));
  const days: string[] = [];
  for (let t = Date.parse(range.start); t <= Date.parse(range.end); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const max = Math.max(1, ...days.map(d => byDay.get(d) ?? 0));
  return (
    <div>
      <p className="text-meta text-[var(--color-text-secondary)] mb-2">Visitors per day · 28 days (peak {max})</p>
      <div className="flex items-end gap-[3px] h-28 border-b border-[var(--color-border)]">
        {days.map(d => {
          const v = byDay.get(d) ?? 0;
          return (
            <div
              key={d}
              title={`${d}: ${v}`}
              className="flex-1 bg-[var(--color-accent)] rounded-t-[2px] min-h-[1px]"
              style={{ height: `${(v / max) * 100}%`, opacity: v ? 0.85 : 0.15 }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-[var(--color-text-secondary)] mt-1">
        <span>{range.start}</span>
        <span>{range.end}</span>
      </div>
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <p className="text-meta font-semibold text-[var(--color-text-primary)] mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-meta text-[var(--color-text-secondary)]">Nothing yet.</p>
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
