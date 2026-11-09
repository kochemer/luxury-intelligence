import type { InsightChart, InsightSource, StoredInsight } from '@/lib/analytics/insights/types';
import { axisLabel, barTitle, dayMonthYear, isMonthlySeries } from '@/lib/analytics/display';
import RemoveInsightButton from '../RemoveInsightButton';
import { EmptyNote, ErrorNote, Section, type Settled } from '../ui';

const SOURCE_NAMES: Record<InsightSource, string> = {
  amplitude: 'Amplitude',
  counter: 'Visit counter',
  search: 'Search Console',
  subscribers: 'Subscribers',
};

const EYEBROW = 'font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)]';

export function InsightsSection({ insights }: { insights: Settled<StoredInsight[]> }) {
  return (
    <Section
      title="Historical insights"
      note="Facts worth remembering from the data so far. A weekly agent adds at most one new one each Sunday and retires the weakest when there are six. Every number is checked against the data before it is saved."
    >
      {!insights.ok ? (
        <ErrorNote error={insights} />
      ) : insights.value.length === 0 ? (
        <EmptyNote>No insights yet. The weekly agent adds one each Sunday.</EmptyNote>
      ) : (
        <div className="grid grid-flow-dense grid-cols-1 min-[640px]:grid-cols-2 min-[900px]:grid-cols-3 gap-3">
          {insights.value.map(i => <Tile key={i.id} insight={i} />)}
        </div>
      )}
    </Section>
  );
}

function Tile({ insight }: { insight: StoredInsight }) {
  const { tile } = insight;
  const wide = tile.chart?.kind === 'weekly';
  return (
    <article
      className={`border border-[var(--color-border)] rounded-lg p-4 flex flex-col justify-between gap-3 min-w-0 ${
        wide ? 'min-[640px]:col-span-2' : ''
      }`}
    >
      <div>
        <p className={`${EYEBROW} mb-2`}>{tile.eyebrow}</p>
        <p className="text-[2.5rem] font-semibold leading-[1.05] tabular-nums tracking-[-0.01em] text-[var(--color-text-primary)]">
          {tile.hero}
          {tile.unit === '%' ? (
            <span className="text-2xl font-normal ml-px tracking-normal">%</span>
          ) : tile.unit ? (
            <span className="text-base font-normal text-[var(--color-text-secondary)] ml-1.5 tracking-normal">{tile.unit}</span>
          ) : null}
        </p>
        <p className="text-[14px] font-semibold leading-[1.4] mt-1.5 text-[var(--color-text-primary)]">{tile.summary}</p>
        {tile.chart && <Chart chart={tile.chart} summary={tile.summary} />}
        <p className="text-[12.5px] leading-[1.45] text-[var(--color-text-secondary)] mt-2.5">{tile.detail}</p>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2.5 text-[12px] text-[var(--color-text-secondary)]">
        <p>
          {insight.sources.map(s => SOURCE_NAMES[s] ?? s).join(', ')} · added {dayMonthYear(insight.addedOn)}
        </p>
        <RemoveInsightButton id={insight.id} />
      </div>
    </article>
  );
}

function Chart({ chart, summary }: { chart: InsightChart; summary: string }) {
  if (chart.kind === 'weekly') return <Weekly chart={chart} summary={summary} />;
  if (chart.kind === 'share') return <Share chart={chart} />;
  return <MiniBars chart={chart} />;
}

function Weekly({ chart, summary }: { chart: Extract<InsightChart, { kind: 'weekly' }>; summary: string }) {
  const { labels, values, highlight } = chart;
  if (!values.length) return null;
  const monthly = isMonthlySeries(labels);
  const max = Math.max(1, ...values);
  const last = values.length - 1;
  return (
    <>
      <div
        role="img"
        aria-label={`${summary} ${values.length} ${monthly ? 'months' : 'weeks'}, ${axisLabel(labels[0]!, monthly)} to ${axisLabel(labels[last]!, monthly)}; highlighted: ${axisLabel(labels[highlight] ?? labels[0]!, monthly)}, ${(values[highlight] ?? 0).toLocaleString('en-GB')}`}
        className="flex items-end gap-0.5 h-[86px] pt-[14px] mt-3.5"
      >
        {values.map((v, i) => {
          const hi = i === highlight;
          return (
            <span
              key={i}
              title={barTitle(labels[i] ?? '', v, monthly)}
              className={`relative flex-1 min-w-[3px] rounded-t-[2px] hover:opacity-80 ${hi ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bar)]'}`}
              style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
            >
              {hi && (
                <em
                  className={`absolute bottom-full pb-0.5 not-italic text-[11px] tabular-nums font-semibold text-[var(--color-text-primary)] ${
                    i === 0 ? 'left-0' : i === last ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  {v.toLocaleString('en-GB')}
                </em>
              )}
            </span>
          );
        })}
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-[var(--color-text-secondary)] mt-1">
        <span>{axisLabel(labels[0]!, monthly)}</span>
        <span>{axisLabel(labels[last]!, monthly)}</span>
      </div>
    </>
  );
}

function Share({ chart }: { chart: Extract<InsightChart, { kind: 'share' }> }) {
  const rest = Math.max(0, chart.whole - chart.part);
  const fmt = (n: number) => n.toLocaleString('en-GB');
  return (
    <>
      <div
        role="img"
        aria-label={`${fmt(chart.part)} ${chart.partLabel}, ${fmt(rest)} ${chart.restLabel}`}
        className="flex gap-0.5 h-2.5 mt-3.5"
      >
        <span
          title={`${chart.partLabel}: ${fmt(chart.part)}`}
          className="bg-[var(--color-accent)] rounded-l-[4px] min-w-[3px]"
          style={{ flex: Math.max(chart.part, 0) }}
        />
        <span
          title={`${chart.restLabel}: ${fmt(rest)}`}
          className="bg-[var(--color-bar)] rounded-r-[4px] min-w-[3px]"
          style={{ flex: rest }}
        />
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-[var(--color-text-secondary)] mt-1">
        <span><b className="font-semibold text-[var(--color-text-primary)]">{fmt(chart.part)}</b> {chart.partLabel}</span>
        <span>{fmt(rest)} {chart.restLabel}</span>
      </div>
    </>
  );
}

function MiniBars({ chart }: { chart: Extract<InsightChart, { kind: 'bars' }> }) {
  const rows = chart.rows.slice(0, 5);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ul className="grid gap-1.5 mt-3.5 text-[12px]">
      {rows.map(r => (
        <li
          key={r.label}
          title={`${r.label}: ${r.value.toLocaleString('en-GB')}`}
          className="grid grid-cols-[minmax(0,9.75rem)_minmax(0,1fr)_1.75rem] items-center gap-2"
        >
          <span className="truncate text-[var(--color-text-primary)]">{r.label}</span>
          <span className="block h-2 rounded-r-[4px] bg-[var(--color-border)]/40">
            <span className="block h-full rounded-r-[4px] bg-[var(--color-accent)]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums text-[var(--color-text-secondary)]">{r.value.toLocaleString('en-GB')}</span>
        </li>
      ))}
    </ul>
  );
}
