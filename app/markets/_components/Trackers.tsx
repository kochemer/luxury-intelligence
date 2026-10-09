'use client';

/** Tabbed move trackers, derived from the moves list. All content is in the server-rendered HTML. */

import { useRef, useState, type KeyboardEvent } from 'react';
import type { MarketMove, MoveType } from '@/lib/markets/types';
import ArticleLink from './ArticleLink';
import { MoveChip, formatDay } from './format';

const TABS: { id: string; label: string; type?: MoveType }[] = [
  { id: 'pricing', label: 'Price changes', type: 'Pricing' },
  { id: 'people', label: 'People', type: 'Leadership' },
  { id: 'openings', label: 'Openings', type: 'Retail' },
  { id: 'results', label: 'Results', type: 'Results' },
  { id: 'deals', label: 'Deals', type: 'Deal' },
  { id: 'all', label: 'All moves' },
];

export default function Trackers({ moves }: { moves: MarketMove[] }) {
  const tabs = TABS.map(t => ({ ...t, items: t.type ? moves.filter(m => m.type === t.type) : moves }));
  const [picked, setPicked] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeId = picked ?? (tabs.find(t => t.items.length)?.id ?? tabs[0]!.id);
  const active = tabs.find(t => t.id === activeId)!;

  const onKey = (e: KeyboardEvent, i: number) => {
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j < 0) return;
    e.preventDefault();
    setPicked(tabs[j]!.id);
    refs.current[j]?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="Trackers" className="flex flex-wrap gap-2 mb-5">
        {tabs.map((t, i) => {
          const on = t.id === activeId;
          return (
            <button
              key={t.id}
              ref={el => { refs.current[i] = el; }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls="tracker-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setPicked(t.id)}
              onKeyDown={e => onKey(e, i)}
              className={`text-[13.5px] font-medium border rounded-[2px] px-3.5 py-2 cursor-pointer text-[var(--color-text-primary)] hover:border-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${on ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)]' : 'bg-transparent border-[var(--color-border)]'}`}
            >
              {t.label}<span className="font-ibm-mono text-[12px] text-[var(--color-text-secondary)] ml-1.5">{t.items.length}</span>
            </button>
          );
        })}
      </div>
      <div
        id="tracker-panel" role="tabpanel" aria-labelledby={`tab-${active.id}`} tabIndex={0}
        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]"
      >
        {active.items.length === 0 ? (
          <p className="m-0 py-3 border-t border-[var(--color-border)] text-[var(--color-text-secondary)]">None in the last six weeks.</p>
        ) : (
          <ul className="list-none m-0 p-0">
            {active.items.map(m => (
              <li key={`${m.brand}-${m.date}-${m.url}`} className="grid grid-cols-[52px_minmax(0,1fr)] md:grid-cols-[58px_minmax(0,1fr)] gap-x-3.5 gap-y-1 py-3 border-t border-[var(--color-border)] text-[15px]">
                <span className="font-ibm-mono text-[12.5px] text-[var(--color-text-secondary)] pt-0.5">{formatDay(m.date)}</span>
                <span className="min-w-0">
                  <strong>{m.brand}</strong>{' · '}
                  <ArticleLink
                    url={m.url} title={m.title} source={m.source}
                    className="underline decoration-[var(--color-accent)] underline-offset-[3px] hover:text-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    {m.title}
                  </ArticleLink>
                  {m.importance === 'major' && (
                    <span className="inline-block align-[1px] ml-1.5 text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--color-accent)] border border-[var(--color-accent)] px-1.5 rounded-[2px]">major</span>
                  )}
                  {active.id === 'all' && <>{' '}<MoveChip type={m.type} /></>}
                  {' '}
                  <span className="text-[13.5px] text-[var(--color-text-secondary)]">
                    · {m.source}{m.outlets > 1 ? ` · ${m.outlets} outlets` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
