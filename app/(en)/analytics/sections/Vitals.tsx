import { VITAL_METRICS, type VitalMetric, type VitalStat, type WebVitals } from '@/lib/analytics/amplitude';
import { formatVital } from '@/lib/analytics/display';
import { EmptyNote, ErrorNote, ODD_LAST_WIDE, Section, type Settled } from '../ui';
import './vitals.css';

const DESCRIPTIONS: Record<VitalMetric, string> = {
  LCP: 'Loading: largest content painted',
  INP: 'Responsiveness to taps and clicks',
  CLS: 'Layout shift while loading',
  FCP: 'First content painted',
  TTFB: 'Server response',
};

const STATUS = {
  good: { icon: '✓', word: 'Good', bg: 'var(--color-up)' },
  'needs-work': { icon: '▲', word: 'Needs work', bg: 'var(--vital-warn)' },
  poor: { icon: '✕', word: 'Poor', bg: 'var(--color-down)' },
} as const;

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function VitalsSection({ vitals }: { vitals: Settled<WebVitals> }) {
  const empty = vitals.ok && VITAL_METRICS.every(m => vitals.value.metrics[m].samples === 0);
  const anySampled = vitals.ok && VITAL_METRICS.some(m => vitals.value.metrics[m].sampled);
  return (
    <Section
      title="Web vitals"
      note="How fast pages feel for visitors who accepted cookies: the 75th percentile (three in four page loads are at least this good), rated by Google’s thresholds."
    >
      {!vitals.ok ? (
        <ErrorNote error={vitals} />
      ) : empty ? (
        <EmptyNote>No page-load measurements yet. Capture started with this release.</EmptyNote>
      ) : (
        <div className="vitals-scope">
          <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 ${ODD_LAST_WIDE}`}>
            {VITAL_METRICS.map(m => <Vital key={m} metric={m} stat={vitals.value.metrics[m]} />)}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-text-secondary)] mt-3">
            <Legend color="var(--color-up)" label="Good" />
            <Legend color="var(--vital-warn)" label="Needs work" />
            <Legend color="var(--color-down)" label="Poor" />
          </p>
          {anySampled && (
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-2">
              Sampled: some metrics have more distinct values than Amplitude returns, so the figures are approximate.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <i className="inline-block w-2.5 h-2.5 rounded-[2px] mr-1.5 align-[-1px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function Vital({ metric, stat }: { metric: VitalMetric; stat: VitalStat }) {
  const label = `${metric} · p75`;
  const none = stat.samples === 0 || stat.p75 === null || stat.rating === null;
  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 min-w-0">
      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)] mb-2">{label}</p>
      {none ? (
        <>
          <p className="text-xl font-semibold text-[var(--color-text-secondary)] leading-[1.3]">–</p>
          <p className="text-[12px] font-semibold text-[var(--color-text-primary)] mt-1">No measurements yet</p>
        </>
      ) : (
        <>
          <p className="text-[1.35rem] font-semibold tabular-nums leading-[1.3] text-[var(--color-text-primary)]">
            {formatVital(metric, stat.p75!)}
          </p>
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold mt-1 text-[var(--color-text-primary)]">
            <span
              aria-hidden="true"
              className="inline-grid place-items-center w-4 h-4 rounded-full text-[10px] leading-none text-[var(--color-bg)]"
              style={{ background: STATUS[stat.rating!].bg }}
            >
              {STATUS[stat.rating!].icon}
            </span>
            {STATUS[stat.rating!].word}
          </p>
          <div
            role="img"
            aria-label={`${pct(stat.good)} good, ${pct(stat.needsWork)} needs work, ${pct(stat.poor)} poor`}
            className="flex gap-0.5 h-2 mt-2.5"
          >
            <span className="min-w-[2px] rounded-l-[4px] rounded-r-[2px]" title={`Good: ${pct(stat.good)}`} style={{ flex: stat.good, background: 'var(--color-up)' }} />
            <span className="min-w-[2px] rounded-[2px]" title={`Needs work: ${pct(stat.needsWork)}`} style={{ flex: stat.needsWork, background: 'var(--vital-warn)' }} />
            <span className="min-w-[2px] rounded-l-[2px] rounded-r-[4px]" title={`Poor: ${pct(stat.poor)}`} style={{ flex: stat.poor, background: 'var(--color-down)' }} />
          </div>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">
            {pct(stat.good)} good · <span className="whitespace-nowrap">{stat.samples.toLocaleString('en-GB')} page loads</span>
          </p>
        </>
      )}
      <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">{DESCRIPTIONS[metric]}</p>
    </div>
  );
}
