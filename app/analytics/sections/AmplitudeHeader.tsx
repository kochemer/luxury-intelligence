import { CONSENT_START, type ConsentedVisits } from '@/lib/analytics/amplitude';
import { EmptyNote, ErrorNote, RangePicker, fmtDate, type Settled } from '../ui';

export interface CoverageLine { window: { start: string; end: string }; personDays: number; visitorDays: number }

/** The group header: eyebrow, coverage line and the one period picker for every Amplitude section below. */
export function AmplitudeHeader({
  days, configured, coverage,
}: { days: number; configured: boolean; coverage: Settled<CoverageLine | null> }) {
  return (
    <div className="mt-12 pt-6 border-t border-[var(--color-border)]">
      <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-[var(--color-accent)] mb-2">
        Amplitude · visitors who accepted cookies
      </p>
      {!configured ? (
        <EmptyNote>
          Add <code>AMPLITUDE_SECRET_KEY</code> in Vercel to show this.
        </EmptyNote>
      ) : (
        <>
          <div className="text-meta text-[var(--color-text-secondary)] max-w-3xl">
            <CoverageText coverage={coverage} />{' '}
            The sections below describe that group only, from {fmtDate(CONSENT_START)} (when the cookie banner took effect) to today, so a 28- or 90-day view starts there.
          </div>
          <div className="mt-3"><RangePicker days={days} /></div>
        </>
      )}
    </div>
  );
}

function CoverageText({ coverage }: { coverage: Settled<CoverageLine | null> }) {
  if (!coverage.ok) return <ErrorNote error={coverage} />;
  if (!coverage.value) {
    return <>This period ends before {fmtDate(CONSENT_START)}, when the cookie banner took effect, so Amplitude has nothing for it.</>;
  }
  const { window, personDays, visitorDays } = coverage.value;
  const pct = visitorDays > 0 ? Math.round((personDays / visitorDays) * 100) : 0;
  return (
    <>
      Since {fmtDate(window.start)}, Amplitude saw{' '}
      <b className="font-semibold text-[var(--color-text-primary)]">
        {personDays.toLocaleString('en-GB')} of the counter&apos;s {visitorDays.toLocaleString('en-GB')} visitor-days ({pct}%)
      </b>
      .
    </>
  );
}

/** Shared empty state when a consented-visits loader returns null. */
export function NoRecordings() {
  return (
    <EmptyNote>
      No recordings in this period. Amplitude only counts visitors who accepted cookies (from {fmtDate(CONSENT_START)}) and keeps recordings for 30 days.
    </EmptyNote>
  );
}

export type Visits = Settled<ConsentedVisits | null>;
