import Link from 'next/link';
import { bucketTop } from '@/lib/analytics/bucketTop';

/** Shared building blocks of the /analytics page and its sections (server components). */

export const RANGES = [7, 14, 28, 90] as const;
export const ACCENT = '#8B6914';
export const SECOND = '#2563EB';

export type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

export async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function Shell({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
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
export function RangePicker({ days }: { days: number }) {
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

export function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 md:p-7">
      <h2 className="text-section font-semibold text-[var(--color-text-primary)] mb-1">{title}</h2>
      <p className="text-meta text-[var(--color-text-secondary)] mb-5">{note}</p>
      {children}
    </section>
  );
}

/** Grid helper: below md an odd last tile spans both columns (no orphan); from md up it is a normal cell. */
export const ODD_LAST_WIDE = '[&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1';

/** `tall` reserves two label lines, so values line up across a row whose labels wrap differently. */
export function Stat({ label, value, prev, suffix, sub, tall }: { label: string; value: number | string; prev?: number; suffix?: string; sub?: string; tall?: boolean }) {
  const diff = prev === undefined || typeof value === 'string' ? null : value - prev;
  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4">
      <p className={`font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)] mb-2 ${tall ? 'min-h-[2lh]' : ''}`}>{label}</p>
      <p className="text-2xl font-semibold text-[var(--color-text-primary)] tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('en-GB') : value}
        {suffix && <span className="text-base font-normal text-[var(--color-text-secondary)]">{suffix}</span>}
      </p>
      {diff !== null && (
        <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">
          {diff === 0 ? 'same as' : `${diff > 0 ? '+' : ''}${diff.toLocaleString('en-GB')} vs`} previous
        </p>
      )}
      {sub && <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">{sub}</p>}
    </div>
  );
}

/**
 * Horizontal bars: one hue, sorted, value at the bar end, "Other" in grey and
 * always last. Plain HTML, so it renders on the server and needs no JS; the
 * title attribute is the hover detail.
 */
export function BarList({ title, note, unit, rows }: { title: string; note?: string; unit: string; rows: Array<[string, number]> }) {
  const bars = bucketTop(rows);
  const max = Math.max(1, ...bars.map(b => b.n));
  const total = bars.reduce((t, b) => t + b.n, 0);
  return (
    <div>
      <p className="text-meta font-semibold text-[var(--color-text-primary)] mb-3">
        {title}
        {note && <span className="font-normal text-[var(--color-text-secondary)]"> · {note}</span>}
      </p>
      {bars.length === 0 ? (
        <p className="text-meta text-[var(--color-text-secondary)]">No visits in this period yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {bars.map(b => (
            <li key={b.name} title={`${b.name}: ${b.n} ${unit} (${Math.round((b.n / total) * 100)}%)`} className="group">
              <div className="flex justify-between gap-3 text-[13px] mb-1">
                <span className={`truncate pr-1 ${b.other ? 'text-[var(--color-text-secondary)] italic' : 'text-[var(--color-text-primary)]'}`}>{b.name}</span>
                <span className="tabular-nums text-[var(--color-text-secondary)] shrink-0">{b.n}</span>
              </div>
              <div className="h-2.5 rounded-[4px] bg-[var(--color-border)]/40">
                <div
                  className="h-full rounded-[4px] transition-opacity group-hover:opacity-80"
                  style={{ width: `${Math.max(2, (b.n / max) * 100)}%`, background: b.other ? 'var(--color-text-secondary)' : 'var(--color-accent)' }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Table({ title, note, rows }: { title: string; note?: string; rows: Array<[string, number]> }) {
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

export function ErrorNote({ error }: { error: { error: string } }) {
  return <p className="text-meta text-[var(--color-down)]">Couldn&apos;t load: {error.error}</p>;
}

/** Bars in the order given (no sorting, no "Other"): for buckets with a natural order. */
export function OrderedBars({ title, unit, rows }: { title: string; unit: string; rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  const total = rows.reduce((t, r) => t + r[1], 0);
  return (
    <div>
      <p className="text-meta font-semibold text-[var(--color-text-primary)] mb-3">{title}</p>
      <ul className="space-y-2.5">
        {rows.map(([name, n]) => (
          <li key={name} title={`${name}: ${n} ${unit} (${total ? Math.round((n / total) * 100) : 0}%)`} className="group">
            <div className="flex justify-between gap-3 text-[13px] mb-1">
              <span className="truncate text-[var(--color-text-primary)]">{name}</span>
              <span className="tabular-nums text-[var(--color-text-secondary)] shrink-0">{n}</span>
            </div>
            <div className="h-2.5 rounded-[4px] bg-[var(--color-border)]/40">
              <div
                className="h-full rounded-[4px] transition-opacity group-hover:opacity-80"
                style={{ width: `${n ? Math.max(2, (n / max) * 100) : 0}%`, background: 'var(--color-accent)' }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A dashed empty-state note. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-meta text-[var(--color-text-secondary)] border border-dashed border-[var(--color-border)] rounded-lg p-3">
      {children}
    </p>
  );
}
