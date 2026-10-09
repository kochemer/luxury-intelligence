/** Signal rows, sparkline and example lists. Server-rendered; links count clicks via ArticleLink. */

import type { CrossSignal, SignalExample, ThemeStat } from '@/lib/markets/types';
import ArticleLink from './ArticleLink';
import { formatDay } from './format';

export const LINK_FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]';

export function BarSpark({ values, unit, name }: { values: number[]; unit: 'share' | 'count'; name: string }) {
  const n = values.length, bw = 9, gap = 5, H = 40, W = Math.max(0, n * bw + (n - 1) * gap);
  const top = Math.max(0, ...values);
  const max = top || 1;
  const peak = unit === 'share' ? `${top}%` : `${top} / wk`;
  const label = unit === 'share' ? '% of articles' : ' articles';
  return (
    <div className="justify-self-start md:justify-self-end">
      <svg
        width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block"
        role="img" aria-label={`${name}, weekly ${unit === 'share' ? 'share of articles' : 'article count'} over ${n} weeks, peak ${peak}`}
      >
        {values.map((v, i) => {
          const h = v > 0 ? Math.max(2, (v / max) * H) : 1;
          return (
            <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} fill={i >= n - 4 ? 'var(--color-accent)' : 'var(--color-bar)'}>
              <title>{`${v}${label}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="font-ibm-mono text-[11px] text-[var(--color-text-secondary)] mt-1 flex justify-between gap-2">
        <span>12 wks ago</span><span>peak {peak}</span>
      </div>
    </div>
  );
}

function Examples({ list }: { list: SignalExample[] }) {
  if (list.length === 0) return null;
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
          {' · '}{e.source}{' · '}{formatDay(e.date)}
        </li>
      ))}
    </ul>
  );
}

const ROW = 'grid grid-cols-[28px_minmax(0,1fr)] md:grid-cols-[36px_minmax(0,1fr)_168px] gap-x-3 md:gap-x-6 gap-y-3 items-start';

function Statement({ name, statement }: { name: string; statement: string | null }) {
  return (
    <p className="text-[18px] md:text-[19px] leading-[1.45] font-medium m-0 mb-2.5">
      <span className="block font-display font-semibold text-[24px] mb-0.5">{name}</span>
      {statement}
    </p>
  );
}

export function SignalRow({ s }: { s: ThemeStat }) {
  const up = s.verdict === 'rising';
  return (
    <div className={`${ROW} py-7 border-t border-[var(--color-border)]`}>
      <div
        className="text-[20px] leading-[1.35]" style={{ color: up ? 'var(--color-up)' : 'var(--color-down)' }}
        role="img" aria-label={up ? 'Rising' : 'Falling'}
      >
        {up ? '▲' : '▼'}
      </div>
      <div className="min-w-0">
        <Statement name={s.name} statement={s.statement} />
        <Examples list={s.examples} />
      </div>
      <div className="col-start-2 md:col-start-auto"><BarSpark values={s.weeklyShare} unit="share" name={s.name} /></div>
    </div>
  );
}

export function CrossPanel({ c }: { c: CrossSignal }) {
  return (
    <div className="mt-2 border border-[var(--color-accent)] bg-[var(--color-accent-light)] px-4 md:px-6 pt-1 rounded-[2px]">
      <p className="intel-section-label text-[var(--color-accent)] pt-5 m-0">From the tech press</p>
      <div className={`${ROW} pt-4 pb-6`}>
        <div className="text-[16px] pt-1 text-[var(--color-accent)]" aria-hidden="true">◆</div>
        <div className="min-w-0">
          <Statement name={c.name} statement={c.statement} />
          <p className="text-[12.5px] text-[var(--color-text-secondary)] m-0 mb-2.5">
            {c.inLuxuryPress.toLocaleString('en-GB')} of {c.total.toLocaleString('en-GB')} articles, from {c.outlets.toLocaleString('en-GB')} outlets, appeared in the luxury trade press.
          </p>
          <Examples list={c.examples} />
        </div>
        <div className="col-start-2 md:col-start-auto"><BarSpark values={c.weekly} unit="count" name={c.name} /></div>
      </div>
    </div>
  );
}
