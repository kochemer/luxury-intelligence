/**
 * Signals section body for the markets pages: a status line (signals, or the
 * closest call when none), then every theme with its share, change and 12-week
 * trend. Server-rendered; mirrors the thresholds in markets/signals.ts.
 */

import type { MarketData, MarketId, SignalExample, ThemeStat } from '@/lib/markets/types';
import ArticleLink from './ArticleLink';
import { formatDay } from './format';
import { CrossPanel, LINK_FOCUS, SignalRow } from './Signals';
import { displaySourceName } from '@/lib/utils/sourceName';

const nf = (n: number) => n.toLocaleString('en-GB');
const pct = (n: number) => `${n.toFixed(1)}%`;
const times = (n: number) => `${n.toFixed(2)}×`;

const COLS = 'md:grid-cols-[minmax(0,1fr)_100px_80px_72px_72px] lg:grid-cols-[minmax(0,1fr)_104px_120px_72px_76px_64px]';
const HEAD = 'font-medium text-[11px] tracking-[0.14em] uppercase text-[var(--color-text-secondary)] whitespace-nowrap';
const CELL_NUM = 'font-ibm-mono text-[13px] tabular-nums md:text-right';

/** The theme nearest to qualifying among those that already meet the volume rules. */
export function closestCall(data: MarketData): string | null {
  const R = data.rules;
  let best: { score: number; text: string } | null = null;
  for (const t of [...data.signals, ...data.watching]) {
    if (t.ratio == null) continue;
    if (t.ratio > 1 && t.total >= R.minArticles && t.recent >= R.minRecent && t.outlets >= R.minOutlets) {
      const score = t.ratio / R.rise;
      if (!best || score > best.score) best = { score, text: `${t.name}, at ${times(t.ratio)} its earlier share; a rise needs ${R.rise}×.` };
    } else if (t.ratio > 0 && t.ratio < 1 && t.prior >= R.fallPriorMin && t.outlets >= R.fallMinOutlets) {
      const score = R.fall / t.ratio;
      if (!best || score > best.score) best = { score, text: `${t.name}, at ${times(t.ratio)} its earlier share; a fall needs ${R.fall.toFixed(2)}× or less.` };
    }
  }
  return best ? `Closest: ${best.text}` : null;
}

function MiniSpark({ values, name }: { values: number[]; name: string }) {
  const n = values.length, bw = 4, gap = 2, H = 22, W = Math.max(0, n * bw + (n - 1) * gap);
  const top = Math.max(0, ...values);
  const max = top || 1;
  return (
    <svg
      width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block"
      role="img" aria-label={`${name}, weekly share of articles over ${n} weeks, peak ${top}%`}
    >
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(1.5, (v / max) * H) : 1;
        return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} fill={i >= n - 4 ? 'var(--color-accent)' : 'var(--color-bar)'} />;
      })}
    </svg>
  );
}

function ExampleList({ list }: { list: SignalExample[] }) {
  return (
    <ul className="list-none m-0 p-0 text-[13.5px] text-[var(--color-text-secondary)]">
      {list.slice(0, 3).map(e => (
        <li key={e.url} className="my-[3px]">
          <ArticleLink
            url={e.url} title={e.title} source={e.source}
            className={`text-[var(--color-text-primary)] underline decoration-[var(--color-accent)] underline-offset-[3px] hover:text-[var(--color-accent)] ${LINK_FOCUS}`}
          >
            {e.title}
          </ArticleLink>
          {' · '}{displaySourceName(e.source)}{' · '}{formatDay(e.date)}
        </li>
      ))}
    </ul>
  );
}

function ThemeRow({ t, minArticles }: { t: ThemeStat; minArticles: number }) {
  const signal = t.verdict !== 'watching';
  const up = t.verdict === 'rising';
  const few = !signal && t.total < minArticles;
  const tone = few ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]';
  const changeColour = signal ? (up ? 'var(--color-up)' : 'var(--color-down)') : 'var(--color-text-secondary)';
  return (
    <div role="rowgroup" className="border-b border-[var(--color-border)] py-3">
      <div role="row" className={`grid grid-cols-[minmax(0,1fr)_auto] ${COLS} gap-x-4 gap-y-1 items-center`}>
        <div role="cell" className={`col-start-1 md:order-1 min-w-0 text-[16px] ${tone}`}>
          <span className={signal ? 'font-semibold' : ''}>{t.name}</span>
          {signal && (
            <span
              className="ml-2 align-[1px] inline-block font-ibm-mono text-[10.5px] tracking-[0.06em] uppercase px-[7px] py-[1px] rounded-[3px] border border-current whitespace-nowrap"
              style={{ color: changeColour }}
            >
              {up ? 'Rising' : 'Falling'}
            </span>
          )}
        </div>
        <div role="cell" className="col-start-2 row-start-1 row-span-2 md:col-start-auto md:row-start-auto md:row-span-1 md:order-4 justify-self-end">
          <MiniSpark values={t.weeklyShare} name={t.name} />
        </div>
        <div className="col-start-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 md:contents">
          <div role="cell" className={`${CELL_NUM} md:order-2 ${tone}`}>
            {pct(t.shareRecent)}<span className="md:hidden text-[var(--color-text-secondary)]"> of articles</span>
          </div>
          <div role="cell" className={`${CELL_NUM} md:order-3`} style={{ color: changeColour }}>
            {t.ratio == null ? 'new' : `${signal ? (up ? '▲ ' : '▼ ') : ''}${times(t.ratio)}`}
            {t.ratio != null && <span className="md:hidden text-[var(--color-text-secondary)]"> vs before</span>}
          </div>
          <div role="cell" className={`${CELL_NUM} md:order-5 text-[var(--color-text-secondary)]`}>
            {nf(t.total)}<span className="md:hidden"> articles</span>
          </div>
          <div role="cell" className={`${CELL_NUM} md:order-6 text-[var(--color-text-secondary)] hidden lg:block`}>{nf(t.outlets)}</div>
        </div>
      </div>
      {t.examples.length > 0 && (
        <details className="mt-1.5">
          <summary className={`cursor-pointer w-fit text-[12.5px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] ${LINK_FOCUS}`}>Examples</summary>
          <div className="pt-1.5"><ExampleList list={t.examples} /></div>
        </details>
      )}
    </div>
  );
}

function StatusLine({ data }: { data: MarketData }) {
  const R = data.rules;
  if (data.signals.length > 0) return <>{data.signals.map(s => <SignalRow key={s.name} s={s} />)}</>;
  const closest = closestCall(data);
  const fewOutlets = data.panel.outlets < R.minOutlets;
  return (
    <div className="border-l-2 border-[var(--color-accent)] pl-4 py-1 mb-8 max-w-[46em]">
      {fewOutlets ? (
        <p className="text-[16px] m-0">
          Too few outlets to call a signal yet: {nf(data.panel.outlets)} outlets have 12 weeks of history and a signal needs {R.minOutlets}.
          {data.panel.excluded > 0 && ` ${nf(data.panel.excluded)} more sources join as they build history.`}
        </p>
      ) : (
        <>
          <p className="font-display font-semibold text-[22px] leading-[1.3] m-0">No theme moved enough to call this week.</p>
          {closest && <p className="text-[15px] text-[var(--color-text-secondary)] m-0 mt-1">{closest}</p>}
        </>
      )}
    </div>
  );
}

export default function ThemeTable({ data, market, h2Class, subClass, noteClass }: {
  data: MarketData; market: MarketId; h2Class: string; subClass: string; noteClass: string;
}) {
  const R = data.rules;
  // Signals keep the engine's order (as in the status rows above); the rest by share.
  const names = new Set(data.signals.map(t => t.name));
  const themes = [...data.signals, ...data.watching.filter(t => !names.has(t.name)).sort((a, b) => b.shareRecent - a.shareRecent)];

  return (
    <>
      <p className="intel-section-label text-[var(--color-accent)] mb-3">Signals</p>
      <h2 id="signals-h" className={`${h2Class} md:text-[34px]`}>What the trade press is writing about</h2>
      <p className={subClass}>
        Each theme’s share of the {market} trade press’s articles, the last 4 weeks against the 8 before. Counted from every article in the last 12 weeks, including ones that didn’t make the digest.
      </p>

      <StatusLine data={data} />

      {themes.length > 0 && (
        <div role="table" aria-label="Themes in the trade press" className="border-t border-[var(--color-border)]">
          <div role="rowgroup" className="hidden md:block">
            <div role="row" className={`grid ${COLS} gap-x-4 py-2 border-b border-[var(--color-border)]`}>
              <div role="columnheader" className={HEAD}>Theme</div>
              <div role="columnheader" className={`${HEAD} text-right`}>Share, 4 wks</div>
              <div role="columnheader" className={`${HEAD} text-right`}>Change</div>
              <div role="columnheader" className={`${HEAD} text-right`}>12 wks</div>
              <div role="columnheader" className={`${HEAD} text-right`}>Articles</div>
              <div role="columnheader" className={`${HEAD} text-right hidden lg:block`}>Outlets</div>
            </div>
          </div>
          {themes.map(t => <ThemeRow key={t.name} t={t} minArticles={R.minArticles} />)}
        </div>
      )}
      {themes.some(t => t.verdict === 'watching' && t.total < R.minArticles) && (
        <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-2.5 mb-0">Greyed themes have fewer than {R.minArticles} articles, too few to call either way.</p>
      )}

      {data.cross && <div className="mt-8"><CrossPanel c={data.cross} /></div>}

      <p className={noteClass}>
        How a signal is called: a theme rises when its share of articles reaches {R.rise}× its earlier level, with {R.minArticles}+ articles ({R.minRecent}+ in the last 4 weeks) from {R.minOutlets}+ outlets. It falls when its share drops to {Math.round(R.fall * 100)}% of its earlier level or less, after {R.fallPriorMin}+ earlier articles from {R.fallMinOutlets}+ outlets.
      </p>
    </>
  );
}
